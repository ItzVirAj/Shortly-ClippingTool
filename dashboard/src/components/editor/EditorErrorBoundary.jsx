import React, { Component } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

export default class EditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, showDetails: false, resetKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Editor encountered an error:', error, errorInfo);
  }

  handleReload = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      showDetails: false,
      resetKey: prev.resetKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 h-full flex flex-col items-center justify-center p-6 bg-zinc-950 text-zinc-100 select-none">
          <div className="max-w-md w-full bg-zinc-900 p-6 rounded-xl border border-zinc-800 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-950/60 text-red-400 flex items-center justify-center mx-auto border border-red-900/60">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">The editor hit an error</h2>
              <p className="text-xs text-zinc-400 mt-1">
                An unexpected problem occurred while rendering the editor.
              </p>
            </div>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors shadow-2xs mx-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload editor
            </button>
            {this.state.error && (
              <div className="text-left pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"
                >
                  {this.state.showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Details
                </button>
                {this.state.showDetails && (
                  <pre className="mt-2 p-2 bg-zinc-950 border border-zinc-800 rounded text-[10px] font-mono text-red-400 overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {this.state.error.toString()}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

