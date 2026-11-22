import { Platform, Share } from 'react-native';

/**
 * Hands the game report to the person to keep.
 *
 * In a browser: the report page (black on white) goes in a frame nobody sees
 * and the browser's print box opens on it, where "Save as PDF" is one of the
 * choices. The frame may run no scripts and is removed afterwards. In the
 * phone app: the phone's share sheet, with the report as plain text.
 */
export async function saveReport(doc: { title: string; text: string; html: string }): Promise<void> {
  if (Platform.OS !== 'web') {
    await Share.share({ title: doc.title, message: doc.text });
    return;
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = doc.html;
  await new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    frame.onerror = () => reject(new Error("Couldn't prepare the report to print."));
    document.body.appendChild(frame);
  });
  const view = frame.contentWindow;
  if (!view) {
    frame.remove();
    throw new Error("This browser wouldn't open the report to print.");
  }
  // The frame's own title is what a saved PDF is named after.
  const remove = () => setTimeout(() => frame.remove(), 1000);
  view.addEventListener('afterprint', remove);
  view.focus();
  view.print();
  // Some browsers never say printing ended; don't leave the frame behind for ever.
  setTimeout(() => frame.remove(), 10 * 60_000);
}
