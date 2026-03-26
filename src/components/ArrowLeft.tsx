interface ArrowLeftProps {
  onClick: () => void;
}

export default function ArrowLeft({ onClick }: ArrowLeftProps) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-center p-[4px] rounded-[12px] shrink-0 size-[44px] cursor-pointer bg-transparent transition-colors active:bg-[#f3f4f6] group"
    >
      <div className="relative shrink-0 size-[24px] transition-transform duration-200 group-active:scale-90">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M15 19L8 12L15 5"
            stroke="#848484"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
