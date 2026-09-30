import React, { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught Error in AquaTwin Component Tree:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 bg-rose-950/80 border border-rose-600/50 rounded-xl flex items-center justify-center text-rose-400 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">AquaTwin - Sistema de Recuperación</h2>
              <p className="text-xs text-slate-400 mt-1">
                Se detectó una discrepancia de estado en el renderizado. Presiona reiniciar para recargar el Gemelo Digital.
              </p>
            </div>
            {this.state.error && (
              <div className="p-3 bg-slate-950 rounded-lg text-left font-mono text-[11px] text-rose-300 overflow-x-auto max-h-28 border border-slate-800">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-xl text-xs flex items-center justify-center gap-2 transition-colors shadow-lg shadow-cyan-600/20"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reiniciar Gemelo Digital</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
