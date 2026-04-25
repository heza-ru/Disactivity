import { Component, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle, RefreshCw } from "lucide-react"
import i18n from "@/i18n"

interface Props {
    children: ReactNode
}

interface State {
    hasError: boolean
    error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props)
        this.state = { hasError: false, error: null }
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error }
    }

    componentDidCatch(error: Error, info: { componentStack: string }) {
        console.error("ErrorBoundary caught:", error, info.componentStack)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-screen gap-4 p-8 text-center">
                    <AlertTriangle className="h-12 w-12 text-destructive" />
                    <div>
                        <h2 className="text-lg font-semibold text-foreground mb-1">
                            {i18n.t("errorBoundary.title")}
                        </h2>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            {this.state.error?.message ?? i18n.t("errorBoundary.defaultMessage")}
                        </p>
                    </div>
                    <Button variant="outline" onClick={this.handleReset}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {i18n.t("errorBoundary.tryAgain")}
                    </Button>
                </div>
            )
        }
        return this.props.children
    }
}
