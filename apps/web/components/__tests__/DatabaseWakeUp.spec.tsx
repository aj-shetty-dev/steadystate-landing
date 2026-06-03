import { cleanup, render, screen, act } from '@testing-library/react';
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

  it('shows warm-up message after 45s (no timeout — polls indefinitely)', () => {
    fetchStub.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderWakeUp();

    act(() => { vi.advanceTimersByTime(46000); });

    // Should show the 45s message, not a timeout/retry state
    expect(screen.getByText(/warming up from sleep/i)).toBeInTheDocument();
    // No retry button — the component never gives up
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('keeps polling indefinitely (never shows timeout)', async () => {
    fetchStub.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    renderWakeUp();

    // Advance way past the old 45s timeout
    act(() => { vi.advanceTimersByTime(90000); });

    // Should still be polling, showing the long-wait message
    expect(screen.getByText(/cold starts can take a minute/i)).toBeInTheDocument();
    // No retry button ever appears
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('does not reference specific providers in messages', () => {
    renderWakeUp();

    // Advance through all time intervals
    for (let s = 0; s <= 90; s += 2) {
      act(() => { vi.advanceTimersByTime(2000); });
    }

    const allText = document.body.textContent ?? '';
    // Generic language — no specific provider names
    expect(allText).not.toMatch(/supabase/i);
    expect(allText).not.toMatch(/periods of inactivity/i);
  });
});
