export default function Titlebar() {
  return (
    <div
      className="drag-region flex-shrink-0 h-11 flex items-center px-4 bg-background border-b border-[hsl(var(--border))]"
      style={{ paddingLeft: 78 }} // Space for macOS traffic lights
    >
      {/* Title or breadcrumb could go here */}
    </div>
  );
}
