interface Props {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled: boolean;
}

export default function SuggestionsBar({ suggestions, onSelect, disabled }: Props) {
  if (!suggestions.length) return null;

  return (
    <div className="px-4 py-2 flex flex-wrap gap-2">
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className="px-3 py-1.5 text-xs font-medium rounded-full border border-[#00704A] text-[#00704A] bg-white hover:bg-[#00704A] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
