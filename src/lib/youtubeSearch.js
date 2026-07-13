export function youtubeSearchUrl(title, artist = '') {
  const query = [title, artist].filter(Boolean).join(' ')
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}
