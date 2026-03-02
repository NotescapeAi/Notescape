# DateDisplay Component

A standardized, accessible, and responsive date display component for the Notescape application.

## Features

- **Responsive**: Adapts font size (14px on mobile, 16px on desktop).
- **Accessible**: Includes `aria-label` for screen readers and uses semantic `<time>` element.
- **High Contrast**: Uses high-contrast text colors for readability (WCAG AA compliant).
- **Internationalization**: Supports custom locales and `Intl.DateTimeFormatOptions`.
- **Robust**: Handles invalid dates, null/undefined values gracefully.
- **Performance**: Memoized to ensure rendering under 100ms.

## Usage

### Basic Usage

```tsx
import { DateDisplay } from './DateDisplay';

// Display a date object
<DateDisplay date={new Date()} />

// Display an ISO string
<DateDisplay date="2023-10-24T12:00:00Z" />

// Display a timestamp
<DateDisplay date={1698148800000} />
```

### Showing Time

To include the time in the display:

```tsx
<DateDisplay date={new Date()} showTime={true} />
// Output: "Oct 24, 2023, 12:00 PM" (depending on locale)
```

### Custom Formatting

You can pass standard `Intl.DateTimeFormatOptions` to customize the output:

```tsx
<DateDisplay 
  date={new Date()} 
  formatOptions={{ 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }} 
/>
// Output: "Tuesday, October 24, 2023"
```

### Localization

Display the date in a specific locale:

```tsx
<DateDisplay date={new Date()} locale="fr-FR" />
// Output: "24 oct. 2023"
```

### Custom Styling

You can add custom classes via `className`. Note that the component applies some base styles (font size, color) which can be overridden or augmented.

```tsx
<DateDisplay 
  date={new Date()} 
  className="text-red-500 font-bold uppercase" 
/>
```

### Handling Missing Dates

If the date is null, undefined, or invalid, a placeholder is shown. You can customize this text:

```tsx
<DateDisplay date={null} placeholder="No date set" />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `date` | `Date \| string \| number \| null \| undefined` | required | The date to display. |
| `locale` | `string` | browser default | The BCP 47 language tag (e.g., 'en-US', 'fr-FR'). |
| `formatOptions` | `Intl.DateTimeFormatOptions` | `{ day: 'numeric', month: 'short', year: 'numeric' }` | Options for formatting the date. |
| `showTime` | `boolean` | `false` | Whether to include default time formatting. Overridden by `formatOptions`. |
| `placeholder` | `string` | `'Date not available'` | Text to show when date is invalid/missing. |
| `className` | `string` | `''` | Additional CSS classes. |

## Accessibility

The component renders a semantic `<time>` element with a `dateTime` attribute containing the ISO string. It also provides an `aria-label` with the formatted date string for screen readers.

## Performance

The component uses `React.memo` and `useMemo` to prevent unnecessary re-renders and re-calculations. Formatting operations are expensive, so they are only performed when props change.
