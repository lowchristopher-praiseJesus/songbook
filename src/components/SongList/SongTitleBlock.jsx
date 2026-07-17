export function SongTitleBlock({ title, songKey, tempo }) {
  return (
    <div className="mb-4">
      <h1
        className="font-bold leading-tight"
        style={{ fontFamily: 'var(--title-font)', fontSize: 'var(--title-size)', color: 'var(--title-color-active)' }}
      >{title}</h1>
      {(songKey || tempo) && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {songKey && <span>Key: {songKey}</span>}
          {songKey && tempo && <span className="mx-1.5">·</span>}
          {tempo && <span>BPM: {tempo}</span>}
        </p>
      )}
    </div>
  )
}
