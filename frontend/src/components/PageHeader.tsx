import { Link } from "react-router-dom";

type Props = {
  title: string;
  subtitle?: string;
  backHref?: string;
  backState?: any;
  actions?: React.ReactNode;
};

export default function PageHeader({ title, subtitle, backHref, backState, actions }: Props) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {backHref && (
          <Link
            to={backHref}
            state={backState}
            className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600"
            aria-label="Back"
          >
            <span className="text-base">&#8592;</span>
          </Link>
        )}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
