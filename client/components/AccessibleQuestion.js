'use client';
/**
 * AccessibleQuestion - High-contrast, screen-reader friendly fallback
 * Used when student has accessibility mode enabled
 * 
 * Props: same as SpotlightQuestion
 */
export default function AccessibleQuestion({
  question,
  onSelectOption,
  selectedOption,
  studentLabel,
}) {
  return (
    <div
      style={{
        padding: '30px',
        background: '#fff',
        color: '#000',
        border: '2px solid #000',
        borderRadius: '8px',
      }}
    >
      {/* Watermark for accessibility mode too */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          fontSize: '10px',
          color: '#ccc',
          opacity: 0.5,
        }}
      >
        {studentLabel}
      </div>

      {/* Question text */}
      <div
        style={{
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '20px',
          lineHeight: '1.6',
        }}
      >
        {question.text}
      </div>

      {/* Marks */}
      <div
        style={{
          fontSize: '14px',
          color: '#666',
          marginBottom: '25px',
        }}
      >
        [{question.marks} mark{question.marks > 1 ? 's' : ''}]
      </div>

      {/* Options */}
      <fieldset
        style={{
          border: 'none',
          padding: 0,
          margin: 0,
        }}
      >
        <legend className="sr-only">Select your answer</legend>
        {question.options.map((opt) => (
          <label
            key={opt.key}
            style={{
              display: 'block',
              padding: '15px 20px',
              marginBottom: '12px',
              border: selectedOption === opt.key ? '3px solid #000' : '2px solid #666',
              borderRadius: '6px',
              background: selectedOption === opt.key ? '#e0f7e0' : '#f9f9f9',
              cursor: 'pointer',
              fontSize: '18px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (selectedOption !== opt.key) {
                e.currentTarget.style.background = '#f0f0f0';
                e.currentTarget.style.borderColor = '#000';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedOption !== opt.key) {
                e.currentTarget.style.background = '#f9f9f9';
                e.currentTarget.style.borderColor = '#666';
              }
            }}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={opt.key}
              checked={selectedOption === opt.key}
              onChange={() => onSelectOption(opt.key)}
              style={{
                marginRight: '12px',
                width: '20px',
                height: '20px',
                cursor: 'pointer',
              }}
            />
            <span style={{ fontWeight: selectedOption === opt.key ? 'bold' : 'normal' }}>
              {opt.key}) {opt.text}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
