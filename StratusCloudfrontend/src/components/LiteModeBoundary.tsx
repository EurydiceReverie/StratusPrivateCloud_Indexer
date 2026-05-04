import { PropsWithChildren, useEffect } from 'react';

export function LiteModeBoundary({ children }: PropsWithChildren) {
  useEffect(() => {
    document.documentElement.classList.add('lite-mode');
    document.body.classList.add('lite-mode');

    return () => {
      document.documentElement.classList.remove('lite-mode');
      document.body.classList.remove('lite-mode');
    };
  }, []);

  return <div className="lite-route">{children}</div>;
}
