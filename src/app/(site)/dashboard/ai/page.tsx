import { PageHeader } from '@/components/dashboard/page-header';
import { CopilotChat } from '@/components/copilot/copilot-chat';

/**
 * Ask Panoply, full page.
 *
 * This page used to be a locked placeholder for a Vanguard-only feature that
 * did not exist. Before that it rendered a hardcoded "Panoply AI" reply naming
 * real protocols and specific yields beside a dead Send button, with nothing
 * marking it as illustration; that was deleted rather than relabelled, because
 * invented yields inside a product that takes deposits are not a placeholder,
 * they are a claim.
 *
 * Almost nothing is left here now. The conversation, the escalation to a
 * person, and the composer all live in CopilotChat, which the floating sheet
 * renders too — so this page is a heading and a frame. That is the point: the
 * sheet and the page cannot answer differently, or disclaim differently,
 * because there is only one of them.
 */
export default function AskPanoplyPage() {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="Ask Panoply"
        description="Your guide to the platform and your account — and the way to reach a person."
      />
      <CopilotChat />
    </div>
  );
}
