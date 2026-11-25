import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { fake, booking } from './helpers/fakeApi';
import { renderApp } from './helpers/render';
import { toDay } from '../src/utils/format';

describe('Home', () => {
  it('lists resources, filters by category and search, and sorts by price', async () => {
    const { user } = await renderApp('/');
    expect(await screen.findByText('Dr. Priya Sharma')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cardiology' }));
    expect(screen.queryByText('Dr. Priya Sharma')).not.toBeInTheDocument();
    expect(screen.getByText('Dr. Aisha Khan')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.type(screen.getByLabelText('Search'), 'mei');
    expect(screen.getByText('Dr. Mei Tan')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Priya Sharma')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Search'), 'zzz');
    expect(screen.getByText('Nothing matches your search.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search'));
    await user.selectOptions(screen.getByLabelText('Sort'), 'low');
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(['Dr. Aisha Khan', 'Dr. Priya Sharma', 'Dr. Mei Tan']);
  });

  it('shows an error instead of loading forever when the API fails', async () => {
    fake.state.failures.push(/GET \/resources$/);
    await renderApp('/');
    expect(await screen.findByText(/Could not load: Server exploded/)).toBeInTheDocument();
  });
});

describe('ResourceDetail', () => {
  it('shows not-found for an unknown resource and an error when loading fails', async () => {
    await renderApp('/resource/999');
    expect(await screen.findByText(/Not found/)).toBeInTheDocument();
  });

  it('shows an error when the resource request fails', async () => {
    fake.state.failures.push(/GET \/resources\/1$/);
    await renderApp('/resource/1');
    expect(await screen.findByText(/Could not load: Server exploded/)).toBeInTheDocument();
  });

  it('books the selected slot and lands on My appointments', async () => {
    const { user } = await renderApp('/resource/1');
    await screen.findByRole('group', { name: 'Time slots' });
    await user.click(screen.getByRole('button', { name: '09:00' }));
    await user.click(screen.getByRole('button', { name: '10:00' }));
    expect(screen.getByText('$40.00', { selector: '.total span' })).toBeInTheDocument(); // picking another time replaces the first
    await user.type(screen.getByLabelText('Your name'), 'Ann Lee');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));

    expect(await screen.findByText(/Appointment BKG-TEST1 confirmed/)).toBeInTheDocument();
    expect(fake.state.bookings[0]).toMatchObject({ hours: [10], total: 40, day: toDay() });
  });

  it('validates the form before calling the API', async () => {
    const { user } = await renderApp('/resource/1');
    await screen.findByRole('group', { name: 'Time slots' });
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));
    expect(screen.getByText('Pick an appointment time')).toBeInTheDocument();
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Email/), 'nope');
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    expect(fake.state.bookings).toHaveLength(0);
  });

  it('disables taken slots and recovers from a conflict', async () => {
    const { user } = await renderApp('/resource/1');
    await screen.findByRole('group', { name: 'Time slots' });
    await user.click(screen.getByRole('button', { name: '09:00' }));
    await user.type(screen.getByLabelText('Your name'), 'Ann');
    await user.type(screen.getByLabelText('Email'), 'ann@example.com');
    // Someone else grabs the slot after we loaded the page.
    fake.state.taken.push({ resourceId: 1, day: toDay(), hour: 9 });
    await user.click(screen.getByRole('button', { name: 'Confirm appointment' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/just booked/);
    await waitFor(() => expect(screen.getByRole('button', { name: '09:00 (taken)' })).toBeDisabled());
  });

  it('shows an error when availability cannot load', async () => {
    fake.state.failures.push(/availability/);
    await renderApp('/resource/1');
    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
  });

  it('reloads availability when the date changes', async () => {
    await renderApp('/resource/1');
    await screen.findByRole('group', { name: 'Time slots' });
    // jsdom date inputs reject char-by-char typing, so set the value in one change event.
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2031-05-06' } });
    await waitFor(() =>
      expect(fake.request).toHaveBeenCalledWith('/resources/1/availability?day=2031-05-06'));
  });
});

describe('Bookings', () => {
  it('shows an empty state', async () => {
    await renderApp('/bookings');
    expect(screen.getByText(/No appointments yet/)).toBeInTheDocument();
  });

  it('lists bookings and cancels one', async () => {
    fake.reset({ bookings: [booking()], taken: [{ resourceId: 1, day: '2030-01-02', hour: 9 }] });
    const { user } = await renderApp('/bookings');
    const card = screen.getByText(/Dr. Priya Sharma/).closest('.order');
    expect(within(card).getByText(/2030-01-02 · 09:00–10:00, 10:00–11:00/)).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Cancel appointment' }));
    expect(await within(card).findByText('Cancelled')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Cancel appointment' })).not.toBeInTheDocument();
  });

  it('shows the error banner when cancelling fails and lets you dismiss it', async () => {
    fake.reset({ bookings: [booking()] });
    fake.state.failures.push(/cancel/);
    const { user } = await renderApp('/bookings');
    await user.click(screen.getByRole('button', { name: 'Cancel appointment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('App shell', () => {
  it('shows the upcoming-bookings badge and a 404 page', async () => {
    fake.reset({ bookings: [booking(), booking({ id: 'BKG-OLD2', status: 'cancelled' })] });
    await renderApp('/nowhere');
    expect(screen.getByText('Page not found.')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.badge' })).toBeInTheDocument();
  });

  it('shows a banner when the initial load fails', async () => {
    fake.state.failures.push(/GET \/bookings$/);
    await renderApp('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded');
  });
});
