'use client';

interface AffiliateLinksProps {
  destination: string;
  startDate?: string;
  endDate?: string;
}

export default function AffiliateLinks({ destination, startDate, endDate }: AffiliateLinksProps) {
  const enc = encodeURIComponent(destination);

  const flightsUrl = startDate && endDate
    ? `https://www.google.com/travel/flights?q=flights+to+${enc}&qs=departure_date:${startDate},return_date:${endDate}`
    : `https://www.google.com/travel/flights?q=flights+to+${enc}`;

  const bookingUrl = startDate && endDate
    ? `https://www.booking.com/searchresults.html?ss=${enc}&checkin=${startDate}&checkout=${endDate}`
    : `https://www.booking.com/searchresults.html?ss=${enc}`;

  const hotelsUrl = `https://www.google.com/travel/hotels?q=hotels+in+${enc}${startDate ? `&checkin=${startDate}` : ''}${endDate ? `&checkout=${endDate}` : ''}`;

  const links = [
    {
      label: 'Search Flights',
      sublabel: 'Google Flights',
      url: flightsUrl,
      icon: String.fromCodePoint(0x2708),
      color: '#3b82f6',
    },
    {
      label: 'Book Hotels',
      sublabel: 'Booking.com',
      url: bookingUrl,
      icon: String.fromCodePoint(0x1F3E8),
      color: '#10b981',
    },
    {
      label: 'Find Hotels',
      sublabel: 'Google Hotels',
      url: hotelsUrl,
      icon: String.fromCodePoint(0x1F3D9),
      color: '#8b5cf6',
    },
  ];

  return (
    <div style={{ padding: '12px 0 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Book your trip
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {links.map(link => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${link.color}40`,
              borderRadius: 10,
              textDecoration: 'none',
              color: '#e5e7eb',
              fontSize: 13,
              fontWeight: 500,
              flex: '1 1 120px',
              minWidth: 120,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = `${link.color}18`)}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          >
            <span style={{ fontSize: 18 }}>{link.icon}</span>
            <span>
              <span style={{ display: 'block' }}>{link.label}</span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>{link.sublabel}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
