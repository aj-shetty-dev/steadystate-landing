import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DatabaseWakeUp from '../DatabaseWakeUp';

const mockRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// We'll control the fetch stub per-test
let fetchStub: ReturnType<typeof vi.fn>;

describe('DatabaseWakeUp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);
    mockRefresh.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function renderWakeUp() {
    return render(<DatabaseWakeUp />);
  }

  it('shows "Welcome back!" immediately', () => {
    renderWakeUp();
    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
  });

  it('shows "Connecting to your database…" after 4 seconds', () => {
    renderWakeUp();
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByText('Connecting to your database…')).toBeInTheDocument();
  });

  it('shows "Retrieving your details…" after 8 seconds', () => {
    renderWakeUp();
    act(() => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText('Retrieving your details…')).toBeInTheDocument();
  });

  it('shows "Almost there…" after 13 seconds', () => {
    renderWakeUp();
    act(() => { vi.advanceTimersByTime(13000); });
    expect(screen.getByText('Almost there…')).toBeInTheDocument();
  });

  it('shows "Still working on it — hang tight." after 20 seconds', () => {
    renderWakeUp();
    act(() => { vi.advanceTimersByTime(20000); });
    expect(screen.getByText('Still working on it — hang tight.')).toBeInTheDocument();
  });

  it('polls /api/health every 3 seconds', async () => {
    fetchStub.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderWakeUp();

    // Immediate poll fires on mount — wait for async effect
    await vi.advanceTimersByTimeAsync(50);
    const initialCalls = fetchStub.mock.calls.length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Poll interval should call again after 3s
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchStub.mock.calls.length).toBeGreaterThan(initialCalls);

    // Another 3s — one more call
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchStub.mock.calls.length).toBeGreaterThan(initialCalls + 1);
  });

  it('calls router.refresh when health returns ok', async () => {
    fetchStub.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    renderWakeUp();

    await act(async () => {
      // immediate poll fires on mount
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows retry button after timeout (45s)', () => {
    fetchStub.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderWakeUp();

    act(() => { vi.advanceTimersByTime(46000); });

    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
  });

  it('resets state when retry button is clicked', async () => {
    fetchStub.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderWakeUp();

    // Advance past timeout
    act(() => { vi.advanceTimersByTime(46000); });
    expect(screen.getByText('Retry')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retry'));

    expect(mockRefresh).toHaveBeenCalled();
    // Should show initial message again
    expect(screen.getByText('Welcome back!')).toBeInTheDocument();
  });

  it('does not show "Supabase" or "patience after inactivity" in any message', () => {
    renderWakeUp();

    // Advance through all time intervals
    for (let s = 0; s <= 50; s += 2) {
      act(() => { vi.advanceTimersByTime(2000); });
    }

    const allText = document.body.textContent ?? '';
    expect(allText).not.toMatch(/supabase/i);
    expect(allText).not.toMatch(/periods of inactivity/i);
  });
});
