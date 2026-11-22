import { Platform, Share } from 'react-native';

/**
 * Hands a small text file to the person. In a browser it downloads under its
 * name; in the phone app the share sheet opens with its text, to send on.
 */
export async function saveFile(file: { name: string; text: string; mime: string }): Promise<void> {
  if (Platform.OS !== 'web') {
    await Share.share({ title: file.name, message: file.text });
    return;
  }
  const url = URL.createObjectURL(new Blob([file.text], { type: `${file.mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
