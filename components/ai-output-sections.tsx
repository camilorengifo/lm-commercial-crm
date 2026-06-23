"use client";

function AiOutputSection({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: string[];
  emptyMessage?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-zinc-700">
          {items.map((item) => (
            <li key={`${title}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">
          {emptyMessage ?? "No recommendations in this section."}
        </p>
      )}
    </div>
  );
}

export function AiOutputSections({
  sections,
}: {
  sections: Array<{
    title: string;
    items: string[];
    emptyMessage?: string;
  }>;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <AiOutputSection
          key={section.title}
          title={section.title}
          items={section.items}
          emptyMessage={section.emptyMessage}
        />
      ))}
    </div>
  );
}
