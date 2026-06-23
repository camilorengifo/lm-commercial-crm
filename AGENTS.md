<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:ai-product-rules -->
# AI Product Rules (Permanent)

**Logistics Masters AI Commercial Assistant** is a freight broker CRM. All AI features must be **assistive only**.

## Product philosophy

This CRM acts as the broker's **memory, analyst, coach, and assistant**.
The broker must **always manually review and execute** any customer communication.

Examples:
- The CRM can say: "Call these customers today."
- The CRM can say: "This account has been forgotten for 14 days."
- The CRM can say: "Use this call script."
- The CRM can draft an email.
- The broker must manually call, email, message, or follow up.

## What the AI CAN do

- Analyze broker CRM data
- Summarize accounts
- Identify forgotten accounts
- Recommend who to call today
- Recommend which follow-ups are overdue
- Suggest when to follow up
- Suggest what to say
- Generate call scripts
- Generate email drafts
- Generate LinkedIn message drafts
- Generate quote follow-up drafts
- Coach the broker
- Prioritize accounts and opportunities
- Explain why an account needs attention

## What the AI must NOT do

- Send emails automatically
- Send WhatsApp messages
- Send SMS/text messages
- Send LinkedIn messages
- Contact customers directly
- Automatically perform outreach
- Automatically create campaigns
- Automatically message contacts
- Make commitments to customers
- Quote rates automatically without broker review

## Implementation rules

- All AI tools must remain **read-only**, **recommendation-based**, and **draft-generation only** unless explicitly requested otherwise in the future.
- Do **not** build email sending, WhatsApp sending, SMS sending, LinkedIn automation, or automated outreach features unless explicitly requested.
- AI must base outputs on CRM data; do not invent facts.
- UI copy should make clear that drafts are for broker review — nothing is sent automatically.
- Entire user-facing UI must be in **English**.
<!-- END:ai-product-rules -->
