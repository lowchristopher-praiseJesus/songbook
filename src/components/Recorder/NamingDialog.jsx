import { useState, useEffect } from 'react'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

export function NamingDialog({ isOpen, defaultName, onSave, onCancel }) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (isOpen) setName(defaultName)
  }, [isOpen, defaultName])

  if (!isOpen) return null

  function handleSubmit(e) {
    e.preventDefault()
    onSave(name)
  }

  return (
    <Modal isOpen={isOpen} title="Name Your Recording" onClose={onCancel}>
      <form role="form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm mb-4 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
