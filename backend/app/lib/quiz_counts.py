from typing import Any, Dict, Optional, Sequence, Tuple


def resolve_requested_counts(
    n_questions: int,
    mcq_count: Optional[int],
    types: Sequence[str],
) -> Tuple[int, int]:
    allowed_types = [str(t).strip().lower() for t in (types or []) if str(t).strip()]
    allows_mcq = "mcq" in allowed_types
    allows_theory = any(t != "mcq" for t in allowed_types)

    if mcq_count is not None:
        requested_mcq_count = int(mcq_count)
    elif allows_mcq and not allows_theory:
        requested_mcq_count = int(n_questions)
    elif allows_theory and not allows_mcq:
        requested_mcq_count = 0
    elif allows_mcq and allows_theory:
        requested_mcq_count = int(round(n_questions / 2))
    else:
        requested_mcq_count = 0

    requested_mcq_count = max(0, min(int(n_questions), requested_mcq_count))
    requested_theory_count = max(0, int(n_questions) - requested_mcq_count)
    return requested_mcq_count, requested_theory_count


def count_items_by_type(items: Sequence[Dict[str, Any]]) -> Tuple[int, int]:
    mcq_count = 0
    theory_count = 0
    for item in items or []:
        if str((item or {}).get("type") or "").strip().lower() == "mcq":
            mcq_count += 1
        else:
            theory_count += 1
    return mcq_count, theory_count


def validate_quiz_counts(
    requested_mcq_count: int,
    requested_theory_count: int,
    actual_mcq_count: int,
    actual_theory_count: int,
) -> Dict[str, Any]:
    requested_mcq_count = int(requested_mcq_count or 0)
    requested_theory_count = int(requested_theory_count or 0)
    actual_mcq_count = int(actual_mcq_count or 0)
    actual_theory_count = int(actual_theory_count or 0)

    is_valid = (
        requested_mcq_count == actual_mcq_count
        and requested_theory_count == actual_theory_count
    )

    failure_reason = None
    if not is_valid:
        failure_reason = "generated_counts_do_not_match_request"

    return {
        "is_valid": is_valid,
        "requested_mcq_count": requested_mcq_count,
        "requested_theory_count": requested_theory_count,
        "actual_mcq_count": actual_mcq_count,
        "actual_theory_count": actual_theory_count,
        "failure_reason": failure_reason,
    }
