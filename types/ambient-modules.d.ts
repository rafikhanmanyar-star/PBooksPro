declare module 'sql.js';

declare module 'react-router-dom' {
  export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void];
  export function useNavigate(): (to: string | number) => void;
}
