# QuoteCue Privacy Policy

Effective date: July 23, 2026

QuoteCue is a Chrome extension that lets users annotate selected text in ChatGPT, Claude, and
DeepSeek responses and include those annotations in a follow-up message. QuoteCue is designed to
process and store data locally unless the user chooses to send an annotated message through the
active AI service.

## Data QuoteCue handles

When a user creates an annotation, QuoteCue handles:

- the text the user selected from a supported AI response;
- a small amount of surrounding text and position information needed to restore the selection;
- the annotation written by the user;
- a randomly generated annotation identifier; and
- the conversation identifier from the page URL, used only to associate a draft with the correct
  conversation.

QuoteCue does not collect account credentials, authentication cookies, general browsing history,
payment information, analytics, advertising identifiers, or diagnostic telemetry.

## How data is used

QuoteCue uses this data only to display annotations, restore draft annotations, and compose the
follow-up message requested by the user. QuoteCue does not use data for advertising, profiling,
credit decisions, or any purpose unrelated to its annotation feature.

When the user sends an annotated message, QuoteCue inserts the selected text and annotations into
the active AI service's message composer. The message is then sent through the user's existing
session. The service provider's handling of that message is governed by its own terms and privacy
policy.

## Storage and retention

Draft annotations are stored in `chrome.storage.local` within the user's Chrome profile. QuoteCue
does not operate a server and does not upload drafts to the developer.

A conversation's stored draft is deleted when the annotated message is successfully sent or when
the user clears all of its annotations. Users can also remove all locally stored QuoteCue data by
uninstalling the extension.

## Data sharing and sale

The developer does not receive, sell, rent, or share user data. QuoteCue includes annotation data
in a ChatGPT message only when the user explicitly chooses to send that message. No data is shared
with advertisers, data brokers, or analytics providers.

## Permissions

QuoteCue requests only the following permissions:

- `storage`: saves unfinished annotations locally so they remain available when the page is
  revisited.
- Access to `https://chatgpt.com/*`, `https://claude.ai/*`, and `https://chat.deepseek.com/*`:
  displays the annotation interface on supported AI services, reads only the response text
  selected by the user, restores annotation highlights, and updates the active message composer
  when the user sends annotations.

QuoteCue does not run on other websites.

## Limited use

QuoteCue's use of information is limited to providing its user-facing annotation feature. The
extension does not transfer or use user data for personalized advertising, resale, lending, or
other unrelated purposes. Its handling of user data complies with the Chrome Web Store User Data
Policy, including the Limited Use requirements.

## Security

QuoteCue keeps draft data inside Chrome's extension storage and does not transmit it to a
developer-controlled service. QuoteCue renders its controls in a closed Shadow DOM and hosts
annotation text entry in an extension-origin frame. Field values move to the extension through a
private browser message channel rather than host-page DOM input events.

These browser isolation mechanisms reduce exposure to scripts running on the host page, but they
are not encryption or a process-level security boundary. Users should protect access to their
Chrome profile and device.

## Changes to this policy

If QuoteCue's data practices or permissions change, this policy will be updated before the changed
behavior is released. Material changes will also be disclosed as required by the Chrome Web Store
policies.

## Contact

Questions about this policy can be sent to xingkaixin@gmail.com.
