export function EmptyState({ onFileChange }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-6xl mb-4 select-none">🎵</div>
      <h2 className="text-2xl font-semibold mb-2 text-gray-700 dark:text-gray-300">No songs yet</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        Drag a .sbp file here to get started
      </p>
      <label className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium cursor-pointer focus-within:ring-2 focus-within:ring-indigo-500">
        Import File
        <input
          type="file"
          accept=".sbp,.sbpbackup,application/zip,public.data"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </label>
    </div>
  )
}
