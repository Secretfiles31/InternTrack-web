/**
 * Parses stored journal blob text (JSON or legacy HTML) into structured report fields.
 */
export function parseJournalContent(text, fallback = {}) {
  const reportData = {
    weekNumber: fallback.weekNumber || '',
    inclusiveDates: fallback.inclusiveDates || '',
    activities: '',
    learnings: '',
    firstName: fallback.firstName || '',
    lastName: fallback.lastName || '',
  };

  if (fallback.fileName?.endsWith('.json')) {
    try {
      const parsed = JSON.parse(text);
      return { ...reportData, ...parsed };
    } catch {
      return { ...reportData, activities: text };
    }
  }

  const parser = new DOMParser();
  const docParser = parser.parseFromString(text, 'text/html');
  const headings = docParser.querySelectorAll('h3');
  headings.forEach((h) => {
    const nextEl = h.nextElementSibling;
    if (!nextEl || nextEl.tagName !== 'P') return;
    if (h.textContent.includes('Activities')) {
      reportData.activities = nextEl.textContent.trim();
    }
    if (h.textContent.includes('Learning Experience')) {
      reportData.learnings = nextEl.textContent.trim();
    }
  });

  return reportData;
}

/**
 * Dynamically loads `docx` only when generating or downloading a report
 * so the main application bundle stays small.
 */
export async function buildWeeklyReportDocxBlob(reportData) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');

  const createParagraphs = (textStr) => {
    if (!textStr) return [new Paragraph({ text: '' })];
    return textStr
      .split('\n')
      .map((line) => new Paragraph({ text: line, indent: { firstLine: 720 }, spacing: { after: 120 } }));
  };

  const doc = new Document({
    creator: 'InternTrack',
    title: `Weekly Report - Week ${reportData.weekNumber}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
        heading2: { run: { font: 'Calibri', size: 26, bold: true, color: '111827' } },
      },
    },
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: 'WEEKLY PROGRESS REPORT',
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: "Student's Name: ", bold: true }),
              new TextRun(`${reportData.firstName || ''} ${reportData.lastName || ''}`.trim()),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Week #: ', bold: true }),
              new TextRun(`${reportData.weekNumber || ''}`),
              new TextRun({ text: '    Inclusive Dates: ', bold: true }),
              new TextRun(`${reportData.inclusiveDates || ''}`),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [new TextRun({ text: 'Activities:', bold: true, size: 24 })],
            spacing: { before: 240, after: 120 },
          }),
          ...createParagraphs(reportData.activities),
          new Paragraph({
            children: [new TextRun({ text: 'Learning Experience:', bold: true, size: 24 })],
            spacing: { before: 240, after: 120 },
          }),
          ...createParagraphs(reportData.learnings),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

/**
 * Triggers browser download of a Blob as a file.
 */
export function triggerBlobDownload(blob, fileName) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Dynamically loads `docx-preview` to render a .docx Blob inside a container element.
 */
export async function renderDocxPreview(blob, containerEl) {
  const { renderAsync } = await import('docx-preview');
  containerEl.innerHTML = '';
  await renderAsync(blob, containerEl, undefined, {
    className: 'docx',
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    renderHeaders: true,
    renderFooters: true,
  });
}

