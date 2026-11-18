"""Tests for hook overlay text handling (emoji runs, long-word wrapping,
visual styles, bitmap-emoji scaling, image generation)."""
import os

from PIL import Image, ImageDraw, ImageFont

from hooks import (
    HOOK_STYLES,
    _break_long_word,
    _emoji_scale,
    _measure_width,
    _split_emoji_runs,
    _EMOJI_RE,
    create_hook_image,
)


def _draw_and_font():
    img = Image.new("RGBA", (1, 1))
    draw = ImageDraw.Draw(img)
    return draw, ImageFont.load_default()


class TestEmojiRuns:
    def test_split_mixed_text(self):
        assert _split_emoji_runs("Feuer 🔥 test") == [
            (False, "Feuer "),
            (True, "🔥"),
            (False, " test"),
        ]

    def test_plain_text_single_run(self):
        assert _split_emoji_runs("nur text") == [(False, "nur text")]

    def test_emoji_only(self):
        assert _split_emoji_runs("🔥🚀") == [(True, "🔥🚀")]

    def test_strip_regex(self):
        assert _EMOJI_RE.sub("", "Stop 🛑 doing this! 💯") == "Stop  doing this! "


class TestLongWordWrap:
    def test_pieces_fit_and_recombine(self):
        draw, font = _draw_and_font()
        word = "A" * 60
        max_width = 50
        pieces = _break_long_word(draw, word, font, None, max_width)
        assert len(pieces) > 1
        assert "".join(pieces) == word
        for piece in pieces:
            assert draw.textlength(piece, font=font) <= max_width

    def test_short_word_single_piece(self):
        draw, font = _draw_and_font()
        assert _break_long_word(draw, "kurz", font, None, 1000) == ["kurz"]


class TestHookStyles:
    """The 6 styles are a contract shared with the frontend (HookModal's
    picker and HookOverlay's HOOK_LOOKS must mirror these keys)."""

    def test_expected_style_names(self):
        assert set(HOOK_STYLES) == {
            "pill", "cyan_glow", "classic", "dark", "yellow", "red", "outline", "outline_yellow",
        }

    def test_cyan_glow_has_border_and_glow(self):
        look = HOOK_STYLES["cyan_glow"]
        assert look["pills"] is True
        assert look["border"] == (0, 242, 254, 255)
        assert look["border_width"] >= 2
        assert look["shadow"] is True

    def test_pill_is_one_box_per_line_in_the_bundled_sans(self):
        look = HOOK_STYLES["pill"]
        assert look["pills"] is True
        assert look["font"].endswith("Montserrat-ExtraBold.ttf")
        assert os.path.exists(look["font"]), "the pill font must ship with the repo"

    def test_boxed_styles_have_opaque_box_and_shadow(self):
        for name in ("classic", "dark", "yellow", "red"):
            look = HOOK_STYLES[name]
            assert look["box"][3] > 0, name
            assert look["shadow"] is True, name
            assert look["outline"] is None, name

    def test_outline_styles_have_no_box_but_a_stroke(self):
        for name in ("outline", "outline_yellow"):
            look = HOOK_STYLES[name]
            assert look["box"][3] == 0, name
            assert look["shadow"] is False, name
            color, px = look["outline"]
            assert px > 0 and len(color) == 3, name


class TestEmojiScaling:
    """Fixed-bitmap emoji fonts (NotoColorEmoji only loads at its 109px
    strike) are rescaled to the text size instead of being dropped."""

    def _text_font(self, size=54):
        # A real scalable font so .size is meaningful.
        return ImageFont.truetype(os.path.join("fonts", "NotoSerif-Bold.ttf"), size)

    def test_scale_is_ratio_of_text_size_to_native_strike(self):
        font = self._text_font(54)
        assert _emoji_scale(font, (font, 109)) == 54 / 109

    def test_scalable_font_needs_no_rescale(self):
        font = self._text_font(54)
        assert _emoji_scale(font, (font, 54)) == 1.0

    def test_measure_width_scales_emoji_runs(self):
        draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        font = self._text_font(54)
        emoji_font = self._text_font(109)  # stand-in for a 109px strike
        full = _measure_width(draw, "🔥", font, (emoji_font, 109))
        native = draw.textlength("🔥", font=emoji_font)
        assert abs(full - native * (54 / 109)) < 0.01

    def test_measure_width_without_emoji_font(self):
        draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        font = self._text_font(54)
        assert _measure_width(draw, "hola", font, None) > 0


class TestCreateHookImage:
    def test_every_style_renders(self, tmp_path):
        for style in HOOK_STYLES:
            out = str(tmp_path / f"hook_{style}.png")
            path, w, h = create_hook_image(
                "Did you know? 🤯", 500, out, style=style)
            assert os.path.exists(path), style
            assert w > 0 and h > 0, style
            assert Image.open(path).size == (w, h), style

    def test_unknown_style_falls_back_to_classic(self, tmp_path):
        out = str(tmp_path / "hook_fallback.png")
        path, w, h = create_hook_image("Hola", 500, out, style="nope")
        assert os.path.exists(path) and w > 0 and h > 0


def test_pill_hook_image_stacks_one_box_per_line(tmp_path):
    """Two lines of text -> two rows of box pixels with a boxless column
    beside the shorter one (it is its own pill, not one shared card)."""
    from hooks import create_hook_image
    from PIL import Image
    out = tmp_path / "pill.png"
    path, w, h = create_hook_image("una frase bastante larga para partirse en dos lineas",
                                   600, str(out), style="pill")
    img = Image.open(path).convert("RGBA")
    assert (img.width, img.height) == (w, h)
    alpha_rows = [any(img.getpixel((x, y))[3] > 200 for x in range(0, img.width, 4))
                  for y in range(img.height)]
    assert sum(alpha_rows) > 0


class TestSingleLineStreamerHooks:
    def test_trims_to_4_words_single_line_and_references_streamer(self):
        from hooks import enforce_single_line_hook

        # Already mentions streamer -> keeps <= 4 words + 1 emoji, single line
        h1 = enforce_single_line_hook("KRYO broke GTA\nwith insane luck 😱🔥", streamer="KRYO")
        assert "\n" not in h1
        assert h1.startswith("KRYO ")
        words_only = [w for w in h1.split() if not _EMOJI_RE.fullmatch(w)]
        assert len(words_only) <= 4

        # Missing streamer -> injects streamer name while staying <= 4 words
        h2 = enforce_single_line_hook("Wait what just happened right now 😱", streamer="@KRYO")
        assert "\n" not in h2
        assert "KRYO" in h2
        words_only2 = [w for w in h2.split() if not _EMOJI_RE.fullmatch(w)]
        assert len(words_only2) <= 4

    def test_single_line_image_never_wraps_height(self, tmp_path):
        out_multi = tmp_path / "multi.png"
        out_single = tmp_path / "single.png"
        text = "KRYO broke GTA physics 😱"
        _, _, h_single = create_hook_image(text, 420, str(out_single), style="pill", single_line=True)
        _, _, h_multi = create_hook_image(text, 420, str(out_multi), style="pill", single_line=False)
        assert h_single <= h_multi
        assert h_single > 0
