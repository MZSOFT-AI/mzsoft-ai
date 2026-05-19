import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCcw, Home } from 'lucide-react';
import { Button } from './ui/Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('CRITICAL UI ERROR:', error, errorInfo);
  }

  private handleReset = () => {
    window.location.href = '/';
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 font-sans">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl border border-slate-100 p-10 text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={40} className="text-rose-500" />
            </div>
            
            <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Oups ! Une erreur est survenue</h1>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              L'interface a rencontré un problème inattendu. Ne vous inquiétez pas, vos données sont en sécurité dans le système.
            </p>

            <div className="bg-slate-50 rounded-xl p-4 mb-8 text-left overflow-auto max-h-32 border border-slate-100">
              <code className="text-[10px] font-mono text-rose-600 block leading-tight">
                {this.state.error?.message || 'Erreur inconnue'}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                onClick={this.handleReload}
                className="flex items-center justify-center gap-2"
              >
                <RefreshCcw size={16} />
                Actualiser
              </Button>
              <Button 
                variant="primary" 
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2"
              >
                <Home size={16} />
                Accueil
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
