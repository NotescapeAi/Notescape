import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Props = {
  label: string;
  to?: string;
  state?: Record<string, unknown>;
};

export default function BackLink({ label, to, state }: Props) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => (to ? navigate(to, { state }) : navigate(-1))}
      className="inline-flex items-center gap-2 text-sm font-semibold text-[#5A4B92] hover:text-[#7B5FEF]"
      aria-label={label}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
