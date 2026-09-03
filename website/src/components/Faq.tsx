import { Accordion } from "@base-ui/react/accordion";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqProps {
  items: readonly FaqItem[];
}

export function Faq({ items }: FaqProps) {
  return (
    <Accordion.Root className="border-y border-line" hiddenUntilFound>
      {items.map((item, index) => (
        <Accordion.Item
          className="border-b border-line last:border-b-0"
          key={item.question}
          value={`faq-${index + 1}`}
        >
          <Accordion.Header className="m-0">
            <Accordion.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-[1.03125rem] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              {item.question}
              <CaretDownIcon
                aria-hidden="true"
                className="shrink-0 text-muted transition-transform duration-200 group-data-[panel-open]:rotate-180 motion-reduce:transition-none"
                size={18}
                weight="bold"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="faq-panel text-[0.9375rem] leading-7 text-muted">
            <p className="m-0 max-w-[68ch] pb-6">{item.answer}</p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
