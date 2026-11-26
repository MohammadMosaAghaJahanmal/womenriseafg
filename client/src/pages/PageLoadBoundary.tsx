import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; fallback: ReactNode; route: string };
type State = { failed: boolean; route: string };

export class PageLoadBoundary extends Component<Props, State> {
  state = { failed: false, route: this.props.route };

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.route === state.route ? null : { failed: false, route: props.route };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
