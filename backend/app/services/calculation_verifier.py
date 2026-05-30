"""
Lightweight arithmetic verifier for AI Tutor calculation text.

This intentionally verifies only calculation claims that can be checked safely
with local arithmetic. It is not a symbolic algebra system and it does not try
to prove every mathematical statement.
"""

import ast
import math
import operator
import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
    ast.UAdd: operator.pos,
}


@dataclass
class CalculationCheck:
    expression: str
    claimed: float
    computed: float
    ok: bool


@dataclass
class CalculationVerification:
    checked: int
    errors: List[CalculationCheck]
    trace_values: Dict[str, float]

    @property
    def ok(self) -> bool:
        return not self.errors


@dataclass
class VerifiedCalculation:
    name: str
    expression: str
    value: float


def _safe_eval(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        left = _safe_eval(node.left)
        right = _safe_eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 10:
            raise ValueError("Exponent too large")
        return float(_OPS[type(node.op)](left, right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return float(_OPS[type(node.op)](_safe_eval(node.operand)))
    raise ValueError("Unsupported expression")


def _evaluate_expression(expr: str) -> Optional[float]:
    expr = expr.strip()
    if not expr:
        return None
    expr = re.sub(r"(\d+(?:\.\d+)?)\s*%", r"(\1/100)", expr)
    if not re.fullmatch(r"[0-9eE+\-*/().\s]+", expr):
        return None
    try:
        return float(_safe_eval(ast.parse(expr, mode="eval")))
    except Exception:
        return None


def _normalize_math_text(text: str) -> str:
    normalized = text or ""
    normalized = normalized.replace("\\$", "$")
    normalized = normalized.replace("−", "-").replace("×", "*").replace("÷", "/")
    normalized = normalized.replace(",", "")
    normalized = re.sub(r"\\left|\\right", "", normalized)
    normalized = re.sub(r"\\,|\\;|\\:", " ", normalized)
    normalized = re.sub(r"\\text\{[^}]*\}(?:\^\{?[-+]?\d+\}?)?", "", normalized)
    normalized = re.sub(r"\\approx|≈", "=", normalized)
    normalized = re.sub(r"\\times", "*", normalized)
    normalized = re.sub(r"\\cdot", "*", normalized)
    normalized = re.sub(r"\\div", "/", normalized)
    normalized = re.sub(r"\^\{([^{}]+)\}", r"**(\1)", normalized)
    normalized = re.sub(r"\^(\d+)", r"**\1", normalized)

    frac_pattern = re.compile(r"\\frac\{([^{}]+)\}\{([^{}]+)\}")
    while True:
        updated = frac_pattern.sub(r"((\1)/(\2))", normalized)
        if updated == normalized:
            break
        normalized = updated
    return normalized


def _candidate_equations(text: str) -> List[str]:
    normalized = _normalize_math_text(text)
    candidates: List[str] = []
    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if "=" not in line:
            continue
        line = re.sub(r"\\\[|\\\]|\\\(|\\\)", "", line)
        line = re.sub(r"[\[\]]", "", line)
        line = re.sub(r"[A-Za-z_][A-Za-z0-9_]*\s*=", "=", line)
        line = line.strip()
        if line.startswith("="):
            line = line[1:].strip()
        if re.search(r"\d", line):
            candidates.append(line)
    return candidates


def _candidate_raw_equations(text: str) -> List[str]:
    normalized = _normalize_math_text(text)
    candidates: List[str] = []
    for raw_line in normalized.splitlines():
        line = raw_line.strip()
        if "=" not in line:
            continue
        line = re.sub(r"\\\[|\\\]|\\\(|\\\)", "", line)
        line = re.sub(r"[\[\]]", "", line).strip()
        if re.search(r"\d", line):
            candidates.append(line)
    return candidates


def _number_tolerance(claimed: float) -> float:
    return max(0.1, abs(claimed) * 0.00001)


def _canonical_name(value: str) -> str:
    value = re.sub(r"\\[A-Za-z]+", "", value or "")
    value = re.sub(r"[^A-Za-z0-9_]+", "", value)
    return value.lower()


def _extract_leading_name(part: str) -> Optional[str]:
    match = re.match(r"\s*([A-Za-z][A-Za-z0-9_{}\\]*)\s*$", part or "")
    if not match:
        return None
    name = _canonical_name(match.group(1))
    return name or None


def _display_name(value: str) -> str:
    value = re.sub(r"\\[A-Za-z]+", "", value or "")
    value = re.sub(r"[^A-Za-z0-9_]+", "", value)
    return value or "result"


def _extract_numbers(expr: str) -> List[float]:
    values: List[float] = []
    for token in re.findall(r"-?\d[\d]*(?:\.\d+)?%?", expr or ""):
        value = _evaluate_expression(token)
        if value is not None and math.isfinite(value):
            values.append(value)
    return values


def _extract_explicit_signed_values(text: str) -> List[float]:
    normalized = _normalize_math_text(text)
    values: List[float] = []
    for token in re.findall(r"(?<![A-Za-z0-9])[-+]\s*\$?\s*\d[\d]*(?:\.\d+)?%?", normalized):
        cleaned = token.replace("$", "").replace(" ", "")
        value = _evaluate_expression(cleaned)
        if value is not None and math.isfinite(value) and abs(value) >= 1:
            values.append(value)
    return values[:4]


def _rounded_equal(left: float, right: float) -> bool:
    return abs(left - right) <= max(_number_tolerance(right), 1.0)


def _collect_named_trace_values(text: str) -> Dict[str, float]:
    trace: Dict[str, float] = {}
    for equation in _candidate_raw_equations(text):
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2:
            continue
        name = _extract_leading_name(parts[0])
        if not name:
            continue
        last_value: Optional[float] = None
        for part in reversed(parts[1:]):
            expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", part)
            value = _evaluate_expression(expr)
            if value is not None:
                last_value = value
                break
        if last_value is not None:
            trace[name] = last_value
    return trace


def extract_verified_calculations(text: str, *, limit: int = 6) -> List[VerifiedCalculation]:
    """Return locally computable named calculations from visible tutor text."""
    calculations: List[VerifiedCalculation] = []
    seen: set[str] = set()

    for equation in _candidate_raw_equations(text):
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2:
            continue
        name = _extract_leading_name(parts[0])
        if not name:
            continue

        rhs = parts[1]
        if not re.search(r"[+\-*/]|\*\*", rhs):
            continue

        expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", rhs)
        value = _evaluate_expression(expr)
        if value is None or not math.isfinite(value):
            continue

        display_name = _display_name(parts[0])
        key = display_name.lower()
        if key in seen:
            continue
        seen.add(key)
        calculations.append(VerifiedCalculation(name=display_name, expression=rhs, value=value))
        if len(calculations) >= limit:
            break
    return calculations


def format_verified_calculation_summary(text: str) -> Optional[str]:
    calculations = extract_verified_calculations(text)
    trace = _collect_named_trace_values(text)
    adjusted = _trace_adjusted_total_calculations(text, trace)
    adjusted_names = {item.name.lower() for item in adjusted}
    calculations = [item for item in calculations if item.name.lower() not in adjusted_names]
    calculations.extend(adjusted)
    explicit_signed_values = _extract_explicit_signed_values(text)
    if explicit_signed_values and len(trace) >= 2 and not adjusted:
        calculations.append(
            VerifiedCalculation(
                name="Total",
                expression="visible signed values plus verified intermediate values",
                value=sum(explicit_signed_values) + sum(trace.values()),
            )
        )
    if not calculations:
        return None

    lines = [
        "### Verified calculation.",
        "The arithmetic helper recomputed the visible calculation locally:",
    ]
    seen_names: set[str] = set()
    for item in calculations:
        key = item.name.lower()
        if key in seen_names:
            continue
        seen_names.add(key)
        value_text = f"{item.value:,.2f}" if abs(item.value % 1) > 0.005 else f"{item.value:,.0f}"
        lines.append(f"- \\({item.name} = {value_text}\\)")
    return "\n".join(lines)


def _check_named_reassignment_consistency(text: str) -> List[CalculationCheck]:
    errors: List[CalculationCheck] = []
    previous: Dict[str, Tuple[str, float]] = {}

    for equation in _candidate_raw_equations(text):
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2:
            continue
        name = _extract_leading_name(parts[0])
        if not name:
            continue

        rhs = parts[1]
        expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", rhs)
        value = _evaluate_expression(expr)
        if value is None and len(parts) > 2:
            expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", parts[-1])
            value = _evaluate_expression(expr)
        if value is None:
            continue

        if name in previous:
            previous_expr, previous_value = previous[name]
            if abs(previous_value - value) > _number_tolerance(previous_value):
                errors.append(
                    CalculationCheck(
                        expression=f"{previous_expr} -> {equation}",
                        claimed=value,
                        computed=previous_value,
                        ok=False,
                    )
                )
        previous[name] = (equation, value)
    return errors


def _check_trace_consistency(text: str, trace: Dict[str, float]) -> List[CalculationCheck]:
    if len(trace) < 2:
        return []

    errors: List[CalculationCheck] = []
    known_values = list(trace.values())
    for equation in _candidate_raw_equations(text):
        lowered = equation.lower()
        if not any(marker in lowered for marker in ("total", "sum", "subtotal", "overall", "net", "npv", "answer", "result")):
            continue
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2:
            continue

        for part in parts:
            if "+" not in part:
                continue
            terms = _extract_numbers(part)
            if len(terms) < 2:
                continue

            unmatched_terms: List[float] = []
            available = known_values[:]
            for term in terms:
                match_index = next((index for index, value in enumerate(available) if _rounded_equal(term, value)), None)
                if match_index is None:
                    unmatched_terms.append(term)
                else:
                    available.pop(match_index)

            if unmatched_terms and len(terms) >= min(2, len(known_values)):
                suspect, nearest = min(
                    (
                        (term, value)
                        for term in unmatched_terms
                        for value in known_values
                    ),
                    key=lambda pair: abs(pair[0] - pair[1]),
                )
                if abs(suspect - nearest) > _number_tolerance(nearest):
                    errors.append(
                        CalculationCheck(
                            expression=equation,
                            claimed=suspect,
                            computed=nearest,
                            ok=False,
                        )
                    )
    return errors


def _trace_adjusted_total_calculations(text: str, trace: Dict[str, float]) -> List[VerifiedCalculation]:
    if len(trace) < 2:
        return []

    adjusted: List[VerifiedCalculation] = []
    for equation in _candidate_raw_equations(text):
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2 or "+" not in parts[1]:
            continue
        name = _extract_leading_name(parts[0])
        if not name:
            continue

        known_values = [value for key, value in trace.items() if key != name]
        if len(known_values) < 2:
            continue

        terms = _extract_numbers(parts[1])
        if len(terms) < 2:
            continue

        corrected_terms: List[float] = []
        replacements = 0
        available = known_values[:]
        for term in terms:
            match_index = None
            for index, value in enumerate(available):
                if abs(term - value) <= max(2.0, abs(value) * 0.001):
                    match_index = index
                    break
            if match_index is None:
                corrected_terms.append(term)
            else:
                corrected_terms.append(available.pop(match_index))
                replacements += 1

        if replacements < 2:
            continue

        adjusted.append(
            VerifiedCalculation(
                name=_display_name(parts[0]),
                expression=parts[1],
                value=sum(corrected_terms),
            )
        )
    return adjusted


def verify_calculation_text(text: str, *, max_checks: int = 12) -> CalculationVerification:
    errors: List[CalculationCheck] = []
    checked = 0
    trace_values = _collect_named_trace_values(text)

    for equation in _candidate_equations(text):
        parts = [part.strip() for part in equation.split("=") if part.strip()]
        if len(parts) < 2:
            continue

        for left, right in zip(parts, parts[1:]):
            left_expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", left)
            right_expr = re.sub(r"[^0-9eE+\-*/().%\s]", "", right)
            if not left_expr or not right_expr:
                continue

            left_value = _evaluate_expression(left_expr)
            right_value = _evaluate_expression(right_expr)
            if left_value is None or right_value is None:
                continue
            if not (math.isfinite(left_value) and math.isfinite(right_value)):
                continue

            checked += 1
            ok = abs(left_value - right_value) <= _number_tolerance(right_value)
            if not ok:
                errors.append(
                    CalculationCheck(
                        expression=f"{left.strip()} = {right.strip()}",
                        claimed=right_value,
                        computed=left_value,
                        ok=False,
                    )
                )
            if checked >= max_checks:
                return CalculationVerification(checked=checked, errors=errors, trace_values=trace_values)

    trace_errors = _check_trace_consistency(text, trace_values)
    errors.extend(trace_errors)
    checked += len(trace_errors)

    reassignment_errors = _check_named_reassignment_consistency(text)
    errors.extend(reassignment_errors)
    checked += len(reassignment_errors)

    return CalculationVerification(checked=checked, errors=errors, trace_values=trace_values)
