import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ShareModal } from '../ShareModal.jsx'
import { LicenseContext } from '../../../contexts/LicenseContext'

const songs = [{ id: 's1', meta: { title: 'Song A' }, rawText: '' }]

const licensedValue = { isLicensed: true, licenseStatus: 'valid', licenseKey: 'fake-key', setLicenseKey: vi.fn() }

function renderLicensed(ui) {
  return render(
    <LicenseContext.Provider value={licensedValue}>
      {ui}
    </LicenseContext.Provider>
  )
}

vi.mock('../../../lib/shareApi.js', () => ({
  uploadShare: vi.fn().mockResolvedValue({
    shareUrl: 'https://app/?share=XYZ',
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  }),
}))
vi.mock('../../../lib/conductorApi.js', () => ({
  createConductorSession: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('../../../lib/exportSbp.js', () => ({
  exportSongsAsSbp: vi.fn().mockResolvedValue(new Blob()),
  computeExportId: vi.fn().mockReturnValue(1),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ShareModal conductor section', () => {
  it('shows Enable Conductor Broadcast toggle in idle step when licensed', () => {
    renderLicensed(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.getByLabelText(/enable conductor broadcast/i)).toBeInTheDocument()
  })

  it('hides max followers input when toggle is off', () => {
    renderLicensed(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    expect(screen.queryByLabelText(/max followers/i)).not.toBeInTheDocument()
  })

  it('shows max followers input when toggle is on', () => {
    renderLicensed(<ShareModal isOpen songs={songs} collectionName="Test" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/enable conductor broadcast/i))
    expect(screen.getByLabelText(/max followers/i)).toBeInTheDocument()
  })
})

it('shows conductor link in done step when conductor is enabled and selfDirect is off', async () => {
  renderLicensed(<ShareModal isOpen songs={songs} collectionName="Test" collectionId="col-test" onClose={vi.fn()} />)
  // Enable conductor
  fireEvent.click(screen.getByLabelText(/enable conductor broadcast/i))
  // Turn off selfDirect (it defaults to true) so the conductor link is shown
  fireEvent.click(screen.getByLabelText(/i'll be conducting this myself/i))
  // Click Create link
  fireEvent.click(screen.getByText(/create link/i))
  // Wait for done step
  await waitFor(() => expect(screen.getByText(/conductor link/i)).toBeInTheDocument())
  expect(screen.getByText(/keep private/i)).toBeInTheDocument()
})
