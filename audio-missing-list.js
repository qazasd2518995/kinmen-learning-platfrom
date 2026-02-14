const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
        Header, Footer, PageNumber } = require('docx');
const fs = require('fs');

const tableBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cellBorders = { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder };

// Header cell helper
const headerCell = (text, width) => new TableCell({
  borders: cellBorders,
  width: { size: width, type: WidthType.DXA },
  shading: { fill: "4472C4", type: ShadingType.CLEAR },
  verticalAlign: VerticalAlign.CENTER,
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 24, font: "Microsoft JhengHei" })]
  })]
});

// Data cell helper
const dataCell = (text, width, center = false) => new TableCell({
  borders: cellBorders,
  width: { size: width, type: WidthType.DXA },
  children: [new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
    children: [new TextRun({ text, size: 24, font: "Microsoft JhengHei" })]
  })]
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Microsoft JhengHei", size: 24 } } },
    paragraphStyles: [
      { id: "Title", name: "Title", basedOn: "Normal",
        run: { size: 48, bold: true, color: "000000", font: "Microsoft JhengHei" },
        paragraph: { spacing: { before: 240, after: 360 }, alignment: AlignmentType.CENTER } },
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: "2F5496", font: "Microsoft JhengHei" },
        paragraph: { spacing: { before: 360, after: 120 } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, color: "2F5496", font: "Microsoft JhengHei" },
        paragraph: { spacing: { before: 240, after: 120 } } },
    ]
  },
  sections: [{
    properties: {
      page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "金門話學習平台 - 補錄音檔清單", size: 20, color: "666666", font: "Microsoft JhengHei" })]
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "第 ", size: 20, font: "Microsoft JhengHei" }), new TextRun({ children: [PageNumber.CURRENT], size: 20 }), new TextRun({ text: " 頁", size: 20, font: "Microsoft JhengHei" })]
      })] })
    },
    children: [
      // Title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({ text: "金門話學習平台", bold: true, size: 56, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: "補錄音檔清單", bold: true, size: 44, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 480 },
        children: [new TextRun({ text: "2026 年 2 月 10 日", size: 24, color: "666666", font: "Microsoft JhengHei" })]
      }),

      // Summary
      new Paragraph({
        spacing: { before: 240, after: 240 },
        children: [new TextRun({ text: "總覽", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "平台目前缺少 14 個音檔，需請教師補錄：", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        indent: { left: 720 },
        spacing: { after: 60 },
        children: [new TextRun({ text: "• 詞彙音檔：1 個", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        indent: { left: 720 },
        spacing: { after: 60 },
        children: [new TextRun({ text: "• 對話音檔：1 個", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        indent: { left: 720 },
        spacing: { after: 240 },
        children: [new TextRun({ text: "• 數字與單位音檔：12 個", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 360 },
        children: [new TextRun({ text: "所有音檔應放置於：/audio/ 目錄", size: 24, font: "Microsoft JhengHei" })]
      }),

      // Section 1: Vocabulary
      new Paragraph({
        spacing: { before: 360, after: 240 },
        children: [new TextRun({ text: "1. 詞彙音檔 (1 個)", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Table({
        columnWidths: [1500, 2500, 2500, 3000],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("序號", 1500),
              headerCell("中文", 2500),
              headerCell("金門話拼音", 2500),
              headerCell("音檔名稱", 3000)
            ]
          }),
          new TableRow({
            children: [
              dataCell("1", 1500, true),
              dataCell("菜花", 2500, true),
              dataCell("tshài-hue", 2500, true),
              dataCell("tshai-hue.mp3", 3000)
            ]
          })
        ]
      }),

      // Section 2: Dialogue
      new Paragraph({
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: "2. 對話音檔 (1 個)", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Table({
        columnWidths: [1200, 1800, 1500, 2500, 2500],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("序號", 1200),
              headerCell("情境", 1800),
              headerCell("角色", 1500),
              headerCell("金門話", 2500),
              headerCell("音檔名稱", 2500)
            ]
          }),
          new TableRow({
            children: [
              dataCell("1", 1200, true),
              dataCell("詢問需求", 1800, true),
              dataCell("頭家", 1500, true),
              dataCell("欲幾斤？", 2500, true),
              dataCell("dialogue-inquiry-3.mp3", 2500)
            ]
          })
        ]
      }),

      // Section 3: Numbers
      new Paragraph({
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: "3. 數字與單位音檔 (12 個)", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Table({
        columnWidths: [1200, 1800, 2500, 2000, 2000],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("序號", 1200),
              headerCell("中文", 1800),
              headerCell("金門話拼音", 2500),
              headerCell("意思", 2000),
              headerCell("音檔名稱", 2000)
            ]
          }),
          new TableRow({ children: [dataCell("1", 1200, true), dataCell("一", 1800, true), dataCell("tsit", 2500, true), dataCell("1", 2000, true), dataCell("number-tsit.mp3", 2000)] }),
          new TableRow({ children: [dataCell("2", 1200, true), dataCell("二", 1800, true), dataCell("nn̄g", 2500, true), dataCell("2", 2000, true), dataCell("number-nng.mp3", 2000)] }),
          new TableRow({ children: [dataCell("3", 1200, true), dataCell("三", 1800, true), dataCell("sann", 2500, true), dataCell("3", 2000, true), dataCell("number-sann.mp3", 2000)] }),
          new TableRow({ children: [dataCell("4", 1200, true), dataCell("四", 1800, true), dataCell("sì", 2500, true), dataCell("4", 2000, true), dataCell("number-si.mp3", 2000)] }),
          new TableRow({ children: [dataCell("5", 1200, true), dataCell("五", 1800, true), dataCell("gōo", 2500, true), dataCell("5", 2000, true), dataCell("number-goo.mp3", 2000)] }),
          new TableRow({ children: [dataCell("6", 1200, true), dataCell("六", 1800, true), dataCell("la̍k", 2500, true), dataCell("6", 2000, true), dataCell("number-lak.mp3", 2000)] }),
          new TableRow({ children: [dataCell("7", 1200, true), dataCell("七", 1800, true), dataCell("tshit", 2500, true), dataCell("7", 2000, true), dataCell("number-tshit.mp3", 2000)] }),
          new TableRow({ children: [dataCell("8", 1200, true), dataCell("八", 1800, true), dataCell("pueh", 2500, true), dataCell("8", 2000, true), dataCell("number-peh.mp3", 2000)] }),
          new TableRow({ children: [dataCell("9", 1200, true), dataCell("九", 1800, true), dataCell("káu", 2500, true), dataCell("9", 2000, true), dataCell("number-kau.mp3", 2000)] }),
          new TableRow({ children: [dataCell("10", 1200, true), dataCell("十", 1800, true), dataCell("tsa̍p", 2500, true), dataCell("10", 2000, true), dataCell("number-tsap.mp3", 2000)] }),
          new TableRow({ children: [dataCell("11", 1200, true), dataCell("斤", 1800, true), dataCell("kun", 2500, true), dataCell("重量單位", 2000, true), dataCell("unit-kun.mp3", 2000)] }),
          new TableRow({ children: [dataCell("12", 1200, true), dataCell("箍", 1800, true), dataCell("khoo", 2500, true), dataCell("元（貨幣）", 2000, true), dataCell("unit-khoo.mp3", 2000)] }),
        ]
      }),

      // Summary Table
      new Paragraph({
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: "4. 統計總覽", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Table({
        columnWidths: [4500, 4500],
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              headerCell("類別", 4500),
              headerCell("數量", 4500)
            ]
          }),
          new TableRow({ children: [dataCell("詞彙音檔", 4500, true), dataCell("1", 4500, true)] }),
          new TableRow({ children: [dataCell("對話音檔", 4500, true), dataCell("1", 4500, true)] }),
          new TableRow({ children: [dataCell("數字與單位音檔", 4500, true), dataCell("12", 4500, true)] }),
          new TableRow({
            children: [
              new TableCell({
                borders: cellBorders,
                width: { size: 4500, type: WidthType.DXA },
                shading: { fill: "E2EFDA", type: ShadingType.CLEAR },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "總計", bold: true, size: 24, font: "Microsoft JhengHei" })] })]
              }),
              new TableCell({
                borders: cellBorders,
                width: { size: 4500, type: WidthType.DXA },
                shading: { fill: "E2EFDA", type: ShadingType.CLEAR },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "14", bold: true, size: 24, font: "Microsoft JhengHei" })] })]
              })
            ]
          }),
        ]
      }),

      // Notes
      new Paragraph({
        spacing: { before: 480, after: 240 },
        children: [new TextRun({ text: "5. 備註", bold: true, size: 32, color: "2F5496", font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "1. 音檔格式：建議使用 MP3 格式，相容性最佳", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "2. 音檔目錄：所有音檔放置於 /audio/ 目錄", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "3. 這些項目在原始需求清單中被遺漏，需要補錄", size: 24, font: "Microsoft JhengHei" })]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text: "4. 數字與單位音檔為選用項目，可依教學需求決定是否錄製", size: 24, font: "Microsoft JhengHei" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/Users/justin/金門語教材/補錄音檔清單.docx", buffer);
  console.log("Word 文件已建立：/Users/justin/金門語教材/補錄音檔清單.docx");
});
