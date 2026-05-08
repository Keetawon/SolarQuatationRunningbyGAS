function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Sena Solar - Sales System')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getConfig(key) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Config');
    if (!sheet) return null;
    var data = sheet.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === key) return data[i][1];
    }
    return null;
  } catch (e) { return null; }
}

function generateRunningID(sheetName, prefix) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var date = new Date();
  var year = date.getFullYear().toString().slice(-2);
  var month = ("0" + (date.getMonth() + 1)).slice(-2);
  var currentPrefix = prefix + year + month;

  if (!sheet) return currentPrefix + "0001";

  var data = sheet.getRange("A2:A").getValues();
  var maxNumber = 0;

  for (var i = 0; i < data.length; i++) {
    var id = data[i][0].toString();
    if (id.indexOf(currentPrefix) === 0) {
      var numberPart = parseInt(id.slice(-4), 10);
      if (numberPart > maxNumber) maxNumber = numberPart;
    }
  }
  return currentPrefix + ("000" + (maxNumber + 1)).slice(-4);
}

// ------------------- แปลงตัวเลขเป็นหนังสือไทย -------------------

function convertNumberToThai(num) {
  if (num === 0) return 'ศูนย์';
  var digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  var result = '';

  if (num >= 1000000) {
    result += convertNumberToThai(Math.floor(num / 1000000)) + 'ล้าน';
    num = num % 1000000;
    if (num === 0) return result;
  }

  var places = [
    { v: 100000, n: 'แสน' }, { v: 10000, n: 'หมื่น' }, { v: 1000, n: 'พัน' },
    { v: 100, n: 'ร้อย' }, { v: 10, n: 'สิบ' }, { v: 1, n: '' }
  ];

  for (var i = 0; i < places.length; i++) {
    var digit = Math.floor(num / places[i].v);
    num = num % places[i].v;
    if (digit === 0) continue;

    if (places[i].v === 10 && digit === 1) {
      result += places[i].n;
    } else if (places[i].v === 10 && digit === 2) {
      result += 'ยี่' + places[i].n;
    } else if (places[i].v === 1 && digit === 1 && result !== '') {
      result += 'เอ็ด';
    } else {
      result += digits[digit] + places[i].n;
    }
  }
  return result;
}

function thaiBahtText(amount) {
  if (amount === 0) return 'ศูนย์บาทถ้วน';
  var absAmount = Math.abs(amount);
  var integerPart = Math.floor(absAmount);
  var satang = Math.round((absAmount - integerPart) * 100);

  var result = amount < 0 ? 'ลบ' : '';
  result += (integerPart === 0 ? '' : convertNumberToThai(integerPart)) + 'บาท';

  if (satang > 0) {
    result += convertNumberToThai(satang) + 'สตางค์';
  } else {
    result += 'ถ้วน';
  }
  return result;
}

// ------------------- ส่วนที่อยู่ -------------------

function loadAddressData() {
  try {
    var baseUrl = 'https://raw.githubusercontent.com/kongvut/thai-province-data/master/api/v1/';

    var provRes = UrlFetchApp.fetch(baseUrl + 'province.json');
    var ampRes = UrlFetchApp.fetch(baseUrl + 'amphure.json');
    var tambRes = UrlFetchApp.fetch(baseUrl + 'tambon.json');

    var provinces = JSON.parse(provRes.getContentText());
    var amphures = JSON.parse(ampRes.getContentText());
    var tambons = JSON.parse(tambRes.getContentText());

    var tambonMap = {};
    tambons.forEach(function(t) {
      if (!tambonMap[t.amphure_id]) tambonMap[t.amphure_id] = [];
      tambonMap[t.amphure_id].push({ id: t.id, name: t.name_th, zip: String(t.zip_code) });
    });

    var amphureMap = {};
    amphures.forEach(function(a) {
      if (!amphureMap[a.province_id]) amphureMap[a.province_id] = [];
      amphureMap[a.province_id].push({
        id: a.id, name: a.name_th,
        tambons: (tambonMap[a.id] || []).sort(function(x, y) { return x.name.localeCompare(y.name, 'th'); })
      });
    });

    return provinces.map(function(p) {
      return {
        id: p.id, name: p.name_th,
        amphures: (amphureMap[p.id] || []).sort(function(a, b) { return a.name.localeCompare(b.name, 'th'); })
      };
    }).sort(function(a, b) { return a.name.localeCompare(b.name, 'th'); });

  } catch (e) {
    return { error: e.message };
  }
}

// ------------------- ดึงข้อมูล -------------------

function getAllLeads() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('lead');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    return data.slice(1).map(function(row) {
      var id = row[1] ? row[1].toString().trim() : "";
      var name = row[8] ? row[8].toString().trim() : "";
      return { id: id, name: name, displayText: id + " - " + name };
    }).filter(function(item) { return item.id !== ""; });
  } catch (e) { return []; }
}

function getLeadById(id) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('lead');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][1] && data[i][1].toString().trim() === id.toString().trim()) {
        return {
          leadId: data[i][1], houseNo: data[i][7] || '', phone: data[i][9] || '', project: data[i][10] || ''
        };
      }
    }
    return null;
  } catch (e) { return null; }
}

function searchBookingData(bookingId) {
  if (!bookingId) return null;
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบจอง');
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] && data[i][0].toString().trim() === bookingId.trim()) {
        var surveyDateStr = "";
        if (data[i][20] instanceof Date) {
          var d = data[i][20];
          surveyDateStr = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        }
        return {
          bookingId: data[i][0], leadId: data[i][2], prefix: data[i][3], fName: data[i][4], lName: data[i][5],
          phone: data[i][6], email: data[i][7], taxId: data[i][8], project: data[i][9], houseNo: data[i][10],
          street: data[i][11], subDistrict: data[i][12], district: data[i][13], province: data[i][14], zipcode: data[i][15],
          productId: data[i][16], selectedProduct: data[i][17], productPrice: data[i][18],
          bookingFee: data[i][19], surveyDate: surveyDateStr,
          pdfUrl: data[i][21], status: data[i][22], salesName: data[i][23], salesPhone: data[i][24]
        };
      }
    }
    return null;
  } catch (e) { return { error: "ไม่พบข้อมูลใบจอง" }; }
}

function getBookingList() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบจอง');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    return data.slice(1).map(function(row) {
      var id = row[0] ? row[0].toString().trim() : '';
      var name = (row[4]||'') + ' ' + (row[5]||'');
      var project = row[9] || '';
      var house = row[10] || '';
      var product = row[17] || '';
      return {
        id: id,
        displayText: id + ' — ' + name + ' | ' + project + ' (' + house + ') | ' + product
      };
    }).filter(function(b) { return b.id; });
  } catch (e) { return []; }
}

function getSolarProducts() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('solar_products');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    return data.slice(1).map(function(row) { return { id: row[0], name: row[1], price: row[2] }; }).filter(function(p) { return p.id; });
  } catch (e) { return []; }
}

// ------------------- ใบจอง PDF -------------------

function createBookingPDF(bookingId, formData) {
  var folder = DriveApp.getFolderById(getConfig('BOOKING_FOLDER_ID'));
  var tempFile = DriveApp.getFileById(getConfig('BOOKING_TEMPLATE_ID')).makeCopy(bookingId + ' - ใบจอง - ' + formData.fName, folder);
  var tempDoc = DocumentApp.openById(tempFile.getId());
  var body = tempDoc.getBody();

  body.replaceText('{{booking_id}}', bookingId);
  body.replaceText('{{date}}', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy"));
  body.replaceText('{{customer_name}}', formData.prefix + ' ' + formData.fName + ' ' + formData.lName);
  body.replaceText('{{phone}}', formData.phone);
  body.replaceText('{{tax_id}}', formData.taxId || '-');
  body.replaceText('{{email}}', formData.email || '-');
  body.replaceText('{{address}}', [formData.houseNo, formData.street, formData.subDistrict, formData.district, formData.province, formData.zipcode].join(' ').trim());
  body.replaceText('{{selected_product}}', formData.selectedProduct || '-');
  body.replaceText('{{booking_fee}}', parseFloat(formData.bookingFee).toLocaleString('en-US', { minimumFractionDigits: 2 }));
  body.replaceText('{{survey_date}}', formData.surveyDate ? Utilities.formatDate(new Date(formData.surveyDate), Session.getScriptTimeZone(), "dd/MM/yyyy") : '-');
  body.replaceText('{{sales_name}}', formData.salesName);

  tempDoc.saveAndClose();
  var pdfFile = folder.createFile(tempFile.getAs(MimeType.PDF)).setName(tempFile.getName() + '.pdf');
  tempFile.setTrashed(true);
  return pdfFile.getUrl();
}

function processBooking(formData, createPdfFlag) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบจอง');
    var bookingId = formData.bookingId;
    var isUpdate = false;
    var rowIndex = -1;

    if (bookingId) {
      var data = sheet.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === bookingId) {
          isUpdate = true;
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (!isUpdate) {
      bookingId = generateRunningID('ข้อมูลใบจอง', 'SMBT');
    }

    var pdfUrl = formData.existingPdfUrl || "-";
    var status = "บันทึกแบบร่าง";

    if (createPdfFlag) {
      pdfUrl = createBookingPDF(bookingId, formData);
      status = "สร้างใบจองแล้ว";
    }

    var userLog = "Unknown"; try { userLog = Session.getActiveUser().getEmail(); } catch (e) { }

    var rowData = [
      bookingId, new Date(), formData.leadId, formData.prefix, formData.fName, formData.lName,
      formData.phone, formData.email, formData.taxId, formData.project, formData.houseNo, formData.street,
      formData.subDistrict, formData.district, formData.province, formData.zipcode,
      formData.productId, formData.selectedProduct, formData.productPrice,
      formData.bookingFee, formData.surveyDate,
      pdfUrl, status, formData.salesName, formData.salesPhone, userLog
    ];

    if (isUpdate) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    // Force text format on columns that look like numbers (preserve leading zeros)
    var targetRow = isUpdate ? rowIndex : sheet.getLastRow();
    sheet.getRange(targetRow, 7).setNumberFormat('@');   // Phone
    sheet.getRange(targetRow, 9).setNumberFormat('@');   // Tax_ID
    sheet.getRange(targetRow, 16).setNumberFormat('@');  // Zipcode
    sheet.getRange(targetRow, 25).setNumberFormat('@');  // Sales_Phone

    return { status: 'success', bookingId: bookingId, pdfUrl: pdfUrl };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// ------------------- ใบเสนอราคา PDF -------------------

function processQuotation(formData) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบเสนอราคา');
    var quotationId = generateRunningID('ข้อมูลใบเสนอราคา', 'SMQT');

    var grandTotal = parseFloat(formData.grandTotal) || 0;
    var subtotal = grandTotal / 1.07;
    var vat = grandTotal - subtotal;

    var validityDays = parseInt(formData.validityDays) || 15;
    var validityDate = new Date();
    validityDate.setDate(validityDate.getDate() + validityDays);
    var validityDateStr = Utilities.formatDate(validityDate, Session.getScriptTimeZone(), "dd/MM/yyyy");

    // --- PDF ---
    var folder = DriveApp.getFolderById(getConfig('QUOTATION_FOLDER_ID'));
    var tempFile = DriveApp.getFileById(getConfig('QUOTATION_TEMPLATE_ID')).makeCopy(quotationId + ' - ใบเสนอราคา - ' + formData.fName, folder);
    var tempDoc = DocumentApp.openById(tempFile.getId());
    var body = tempDoc.getBody();

    var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    var address = [formData.houseNo, formData.street, formData.subDistrict, formData.district, formData.province, formData.zipcode].join(' ').trim();

    body.replaceText('{{quotation_id}}', quotationId);
    body.replaceText('{{date}}', todayStr);
    body.replaceText('{{project_name}}', formData.project || '-');
    body.replaceText('{{customer_name}}', formData.prefix + ' ' + formData.fName + ' ' + formData.lName);
    body.replaceText('{{phone}}', formData.phone);
    body.replaceText('{{email}}', formData.email || '-');
    body.replaceText('{{tax_id}}', formData.taxId || '-');
    body.replaceText('{{address}}', address);
    body.replaceText('{{sales_name}}', formData.salesName);
    body.replaceText('{{sales_phone}}', formData.salesPhone);
    body.replaceText('{{system_name}}', formData.systemName || '-');
    body.replaceText('{{system_detail}}', formData.systemDetail || '-');
    body.replaceText('{{subtotal}}', subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    body.replaceText('{{vat}}', vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    body.replaceText('{{grand_total}}', grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    body.replaceText('{{grand_total_thaitext}}', thaiBahtText(grandTotal));
    body.replaceText('{{validity_date}}', validityDateStr);

    var userLog = "-"; try { userLog = Session.getActiveUser().getEmail(); } catch (e) { }
    body.replaceText('{{sales_email}}', userLog);

    tempDoc.saveAndClose();
    var pdfFile = folder.createFile(tempFile.getAs(MimeType.PDF)).setName(tempFile.getName() + '.pdf');
    tempFile.setTrashed(true);
    var pdfUrl = pdfFile.getUrl();

    // --- Sheet (29 columns) ---
    sheet.appendRow([
      quotationId, new Date(), formData.refBookingId, formData.leadId,
      formData.prefix, formData.fName, formData.lName, formData.phone, formData.email, formData.taxId,
      formData.project, formData.houseNo, formData.street, formData.subDistrict, formData.district, formData.province, formData.zipcode,
      formData.systemName, formData.systemDetail,
      parseFloat(subtotal.toFixed(2)), parseFloat(vat.toFixed(2)), parseFloat(grandTotal.toFixed(2)),
      validityDays, validityDateStr,
      formData.salesName, formData.salesPhone, userLog, pdfUrl, 'ออกใบเสนอราคาแล้ว'
    ]);

    // Force text format on columns that look like numbers
    var qLastRow = sheet.getLastRow();
    sheet.getRange(qLastRow, 7).setNumberFormat('@');   // Phone
    sheet.getRange(qLastRow, 9).setNumberFormat('@');   // Tax_ID
    sheet.getRange(qLastRow, 17).setNumberFormat('@');  // Postcode
    sheet.getRange(qLastRow, 26).setNumberFormat('@');  // Sales_Phone

    return { status: 'success', quotationId: quotationId, pdfUrl: pdfUrl };
  } catch (e) { return { status: 'error', message: e.message }; }
}
