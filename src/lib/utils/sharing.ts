export interface ShareData {
  title: string;
  text: string;
  url: string;
}

export function getShareText(assetName: string): string {
  return `Unlock fractional ownership in a real-world oil field with this tokenized RWA asset: ${assetName}`;
}

// Helper function to add UTM parameters to URLs
function addUTMParameters(
  url: string,
  medium: string,
  source: string = medium,
): string {
  const urlObj = new URL(url);
  urlObj.searchParams.set("utm_source", source);
  urlObj.searchParams.set("utm_medium", medium);
  urlObj.searchParams.set("utm_campaign", "asset_sharing");
  urlObj.searchParams.set("utm_content", "social_share");
  return urlObj.toString();
}

export function getShareUrls(shareData: ShareData) {
  const { title, text, url } = shareData;

  // Add UTM parameters for each platform
  const twitterUrl = addUTMParameters(url, "twitter", "twitter");
  const linkedinUrl = addUTMParameters(url, "linkedin", "linkedin");
  const telegramUrl = addUTMParameters(url, "telegram", "telegram");
  const whatsappUrl = addUTMParameters(url, "whatsapp", "whatsapp");
  const emailUrl = addUTMParameters(url, "email", "email");

  const encodedTwitterUrl = encodeURIComponent(twitterUrl);
  const encodedLinkedinUrl = encodeURIComponent(linkedinUrl);
  const encodedTelegramUrl = encodeURIComponent(telegramUrl);
  const encodedWhatsappUrl = encodeURIComponent(whatsappUrl);
  const encodedEmailUrl = encodeURIComponent(emailUrl);
  const encodedText = encodeURIComponent(text);
  const encodedTitle = encodeURIComponent(title);

  return {
    twitter: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedTwitterUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedLinkedinUrl}`,
    telegram: `https://t.me/share/url?url=${encodedTelegramUrl}&text=${encodedText}`,
    whatsapp: `https://api.whatsapp.com/send?text=${encodedText}%20${encodedWhatsappUrl}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedText}%0D%0A%0D%0A${encodedEmailUrl}`,
  };
}

export async function shareViaWebAPI(shareData: ShareData): Promise<boolean> {
  if (!navigator.share) {
    return false;
  }

  try {
    await navigator.share(shareData);
    return true;
  } catch (error) {
    // User cancelled or error occurred
    console.warn("Web Share API failed:", error);
    return false;
  }
}

export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
