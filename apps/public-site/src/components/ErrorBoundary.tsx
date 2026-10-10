import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { reportClientError } from '../lib/errorReporter';

interface Props {
  children?: ReactNode;
  /** UI de fallback opcional. Se omitido, usa o fallback padrão do sistema. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  referenceId: string;
  developmentDetails: string;
}

export class ErrorBoundary extends Component<Props, State> {
  declare readonly props: Readonly<Props>;
  declare setState: Component<Props, State>['setState'];

  public state: State = {
    hasError: false,
    referenceId: '',
    developmentDetails: '',
  };

  public static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const referenceId = reportClientError(error, {
      source: 'react-error-boundary',
      componentStack: errorInfo.componentStack || undefined,
    });

    this.setState({
      referenceId,
      developmentDetails: import.meta.env.DEV
        ? `${error.message}\n${error.stack || ''}\n${errorInfo.componentStack || ''}`
        : '',
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, referenceId: '', developmentDetails: '' });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="w-full max-w-lg rounded-2xl bg-white p-10 text-center shadow-2xl ring-1 ring-black/5">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <h1 className="mb-2 text-xl font-black uppercase tracking-wider text-red-600">Algo deu errado</h1>
            <p className="mb-4 text-sm text-neutral-500">
              Ocorreu um erro inesperado neste módulo. Tente novamente ou recarregue a página.
            </p>

            {this.state.referenceId && (
              <p className="mb-6 rounded-xl bg-neutral-50 px-4 py-3 text-xs font-semibold text-neutral-500">
                Código para atendimento: <span className="font-mono text-neutral-700">{this.state.referenceId}</span>
              </p>
            )}

            {import.meta.env.DEV && this.state.developmentDetails && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-600">
                  Detalhes de desenvolvimento
                </summary>
                <pre className="mt-3 max-h-[200px] overflow-auto whitespace-pre-wrap rounded-xl border border-neutral-100 bg-neutral-50 p-4 font-mono text-xs text-neutral-500">
                  {this.state.developmentDetails}
                </pre>
              </details>
            )}

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={this.handleRetry}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95"
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 rounded-xl bg-neutral-100 px-6 py-2.5 text-sm font-bold text-neutral-700 transition-all hover:bg-neutral-200 active:scale-95"
              >
                <Home className="h-4 w-4" />
                Recarregar página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
