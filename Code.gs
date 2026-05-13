function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Sena Solar - Sales System')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
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

    // Re-write text fields with @ format to preserve leading zeros
    var targetRow = isUpdate ? rowIndex : sheet.getLastRow();
    sheet.getRange(targetRow, 7).setNumberFormat('@').setValue(String(formData.phone));
    sheet.getRange(targetRow, 9).setNumberFormat('@').setValue(String(formData.taxId));
    sheet.getRange(targetRow, 16).setNumberFormat('@').setValue(String(formData.zipcode));
    sheet.getRange(targetRow, 25).setNumberFormat('@').setValue(String(formData.salesPhone));

    return { status: 'success', bookingId: bookingId, pdfUrl: pdfUrl };
  } catch (e) { return { status: 'error', message: e.message }; }
}

// ------------------- ใบเสนอราคา PDF -------------------

function processQuotation(formData, createPdfFlag) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบเสนอราคา');
    var quotationId = formData.quotationId;
    var isUpdate = false;
    var rowIndex = -1;

    if (quotationId) {
      var existing = sheet.getDataRange().getValues();
      for (var i = 1; i < existing.length; i++) {
        if (existing[i][0] === quotationId) {
          isUpdate = true;
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (!isUpdate) {
      quotationId = generateRunningID('ข้อมูลใบเสนอราคา', 'SMQT');
    }

    var grandTotal = parseFloat(formData.grandTotal) || 0;
    var subtotal = grandTotal / 1.07;
    var vat = grandTotal - subtotal;

    var validityDays = parseInt(formData.validityDays) || 15;
    var validityDate = new Date();
    validityDate.setDate(validityDate.getDate() + validityDays);
    var validityDateStr = Utilities.formatDate(validityDate, Session.getScriptTimeZone(), "dd/MM/yyyy");

    var pdfUrl = formData.existingPdfUrl || "-";
    var status = "บันทึกแบบร่าง";

    if (createPdfFlag) {
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
      pdfUrl = pdfFile.getUrl();
      status = "ออกใบเสนอราคาแล้ว";
    }

    var userLog = "-"; try { userLog = Session.getActiveUser().getEmail(); } catch (e) { }

    var rowData = [
      quotationId, new Date(), formData.refBookingId, formData.leadId,
      formData.prefix, formData.fName, formData.lName, formData.phone, formData.email, formData.taxId,
      formData.project, formData.houseNo, formData.street, formData.subDistrict, formData.district, formData.province, formData.zipcode,
      formData.systemName, formData.systemDetail,
      parseFloat(subtotal.toFixed(2)), parseFloat(vat.toFixed(2)), parseFloat(grandTotal.toFixed(2)),
      validityDays, validityDateStr,
      formData.salesName, formData.salesPhone, userLog, pdfUrl, status
    ];

    if (isUpdate) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    // Re-write text fields with @ format to preserve leading zeros
    var targetRow = isUpdate ? rowIndex : sheet.getLastRow();
    sheet.getRange(targetRow, 8).setNumberFormat('@').setValue(String(formData.phone));
    sheet.getRange(targetRow, 10).setNumberFormat('@').setValue(String(formData.taxId));
    sheet.getRange(targetRow, 17).setNumberFormat('@').setValue(String(formData.zipcode));
    sheet.getRange(targetRow, 26).setNumberFormat('@').setValue(String(formData.salesPhone));

    return { status: 'success', quotationId: quotationId, pdfUrl: pdfUrl };
  } catch (e) { return { status: 'error', message: e.message }; }
}

function searchQuotationData(quotationId) {
  console.log('searchQuotationData called with:', quotationId, '(type:', typeof quotationId, ')');
  if (!quotationId) return { error: "ไม่ได้ระบุรหัส" };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบเสนอราคา');
    if (!sheet) return { error: "ไม่พบชีท 'ข้อมูลใบเสนอราคา'" };
    var data = sheet.getDataRange().getValues();
    console.log('sheet rows:', data.length);
    if (data.length <= 1) return { error: "ชีทไม่มีข้อมูล" };
    var target = String(quotationId).trim();
    for (var i = 1; i < data.length; i++) {
      var cellId = data[i][0] ? data[i][0].toString().trim() : '';
      if (cellId === target) {
        console.log('match found at row', i + 1);
        var result = {
          quotationId: String(data[i][0] || ''),
          date: data[i][1] instanceof Date ? data[i][1].toISOString() : String(data[i][1] || ''),
          refBookingId: String(data[i][2] || ''),
          leadId: String(data[i][3] || ''),
          prefix: String(data[i][4] || ''),
          fName: String(data[i][5] || ''),
          lName: String(data[i][6] || ''),
          phone: String(data[i][7] || ''),
          email: String(data[i][8] || ''),
          taxId: String(data[i][9] || ''),
          project: String(data[i][10] || ''),
          houseNo: String(data[i][11] || ''),
          street: String(data[i][12] || ''),
          subDistrict: String(data[i][13] || ''),
          district: String(data[i][14] || ''),
          province: String(data[i][15] || ''),
          zipcode: String(data[i][16] || ''),
          systemName: String(data[i][17] || ''),
          systemDetail: String(data[i][18] || ''),
          subtotal: Number(data[i][19]) || 0,
          vat: Number(data[i][20]) || 0,
          grandTotal: Number(data[i][21]) || 0,
          validityDays: Number(data[i][22]) || 15,
          validityDateStr: String(data[i][23] || ''),
          salesName: String(data[i][24] || ''),
          salesPhone: String(data[i][25] || ''),
          userLog: String(data[i][26] || ''),
          pdfUrl: String(data[i][27] || ''),
          status: String(data[i][28] || '')
        };
        console.log('returning result for', result.quotationId);
        return result;
      }
    }
    console.log('no match for', target);
    return { error: "ไม่พบรหัส " + target + " ในชีท (มี " + (data.length - 1) + " แถว)" };
  } catch (e) {
    console.error('searchQuotationData error:', e.message, e.stack);
    return { error: "Error: " + e.message };
  }
}

function getQuotationList() {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('ข้อมูลใบเสนอราคา');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    return data.slice(1).map(function(row) {
      var id = row[0] ? row[0].toString().trim() : '';
      var name = (row[5] || '') + ' ' + (row[6] || '');
      var project = row[10] || '';
      var status = row[28] || '';
      return {
        id: id,
        displayText: id + ' — ' + name + ' | ' + project + ' | ' + status
      };
    }).filter(function(q) { return q.id; });
  } catch (e) { return []; }
}

// ==================== ROI Helper — Backend APIs ====================

var ROI_SHEETS = {
  assumptions: 'roi_assumption',
  products: 'solar_products',
  plans: 'financing_plan',
  tiers: 'financing_rate_tier',
  benchmarks: 'rate_benchmark',
  tariffs: 'electricity_tariff',
  appliances: 'appliance_preset'
};

function _sheetToObjects(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return h.toString().trim(); });
  return data.slice(1).map(function(row) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var val = row[c];
      if (val instanceof Date) {
        obj[headers[c]] = val.toISOString();
      } else {
        obj[headers[c]] = val;
      }
    }
    return obj;
  });
}

function getBootstrapData() {
  // Bump version when filter logic or shape changes, so cache invalidates automatically.
  var CACHE_KEY = 'roi_bootstrap_v2';
  var CACHE_TTL = 600;
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* cache corrupt, re-read */ }
  }

  var result = {};
  var sheetNames = {
    assumptions: ROI_SHEETS.assumptions,
    products: ROI_SHEETS.products,
    plans: ROI_SHEETS.plans,
    tiers: ROI_SHEETS.tiers,
    benchmarks: ROI_SHEETS.benchmarks,
    tariffs: ROI_SHEETS.tariffs,
    appliances: ROI_SHEETS.appliances
  };

  for (var key in sheetNames) {
    try {
      result[key] = _sheetToObjects(sheetNames[key]);
    } catch (e) {
      result[key] = [];
    }
  }

  // Permissive status filter: keep rows whose status is empty/missing OR active.
  // Only exclude rows explicitly marked inactive/archived/disabled.
  // (solar_products from package_ex.xlsx has no status column at all.)
  function _isActive(row) {
    var s = row && row.status;
    if (s === undefined || s === null || s === '') return true;
    s = s.toString().trim().toLowerCase();
    if (s === 'inactive' || s === 'archived' || s === 'disabled' || s === 'deleted') return false;
    return true;
  }
  result.products = result.products.filter(_isActive);
  result.plans = result.plans.filter(_isActive);
  // tiers: return all, let client filter by plan_id
  result.benchmarks = result.benchmarks.filter(_isActive);
  result.tariffs = result.tariffs.filter(_isActive);
  result.appliances = result.appliances.filter(_isActive);
  result.assumptions = result.assumptions.filter(_isActive);

  try {
    cache.put(CACHE_KEY, JSON.stringify(result), CACHE_TTL);
  } catch (e) { /* cache write failed, non-critical */ }

  return result;
}

function searchRoiSessions(query, limit) {
  if (!limit) limit = 20;
  // Empty query means "list recent" — frontend uses this for the "show all" button.
  var listAll = (query === undefined || query === null || query === '');
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('roi_session');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];

    var headers = data[0].map(function(h) { return h.toString().trim(); });
    var labelIdx = headers.indexOf('customer_label');
    var idIdx = headers.indexOf('session_id');
    var statusIdx = headers.indexOf('status');
    var updatedIdx = headers.indexOf('last_updated');
    var kwIdx = headers.indexOf('selected_kw');
    var netIdx = headers.indexOf('monthly_net');

    if (idIdx === -1) return [];

    var q = listAll ? '' : query.toString().toLowerCase();
    var results = [];
    // Iterate newest first (bottom of sheet) so "list recent" returns latest sessions.
    for (var i = data.length - 1; i >= 1; i--) {
      var sid = data[i][idIdx];
      if (!sid) continue;
      var label = (labelIdx >= 0 && data[i][labelIdx]) ? data[i][labelIdx].toString() : '';
      if (!listAll && label.toLowerCase().indexOf(q) === -1 && sid.toString().toLowerCase().indexOf(q) === -1) {
        continue;
      }
      results.push({
        session_id: sid,
        customer_label: label,
        status: statusIdx >= 0 ? data[i][statusIdx] : '',
        last_updated: updatedIdx >= 0 ? (data[i][updatedIdx] instanceof Date ? data[i][updatedIdx].toISOString() : data[i][updatedIdx]) : '',
        selected_kw: kwIdx >= 0 ? data[i][kwIdx] : 0,
        monthly_net: netIdx >= 0 ? data[i][netIdx] : 0
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (e) { return []; }
}

function loadRoiSession(sessionId) {
  if (!sessionId) return null;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // load session
    var sessionSheet = ss.getSheetByName('roi_session');
    if (!sessionSheet) return null;
    var sData = sessionSheet.getDataRange().getValues();
    if (sData.length < 2) return null;
    var sHeaders = sData[0].map(function(h) { return h.toString().trim(); });
    var sIdIdx = sHeaders.indexOf('session_id');
    if (sIdIdx === -1) return null;

    var session = null;
    var sessionRowIdx = -1;
    for (var i = 1; i < sData.length; i++) {
      if (sData[i][sIdIdx] && sData[i][sIdIdx].toString().trim() === sessionId.toString().trim()) {
        session = {};
        for (var c = 0; c < sHeaders.length; c++) {
          var v = sData[i][c];
          session[sHeaders[c]] = v instanceof Date ? v.toISOString() : v;
        }
        sessionRowIdx = i;
        break;
      }
    }
    if (!session) return null;

    // load appliance lines
    var appSheet = ss.getSheetByName('roi_session_appliance');
    if (appSheet) {
      var aData = appSheet.getDataRange().getValues();
      if (aData.length >= 2) {
        var aHeaders = aData[0].map(function(h) { return h.toString().trim(); });
        var aSessionIdx = aHeaders.indexOf('session_id_fk');
        if (aSessionIdx >= 0) {
          session.appliances = [];
          for (var j = 1; j < aData.length; j++) {
            if (aData[j][aSessionIdx] && aData[j][aSessionIdx].toString().trim() === sessionId.toString().trim()) {
              var line = {};
              for (var k = 0; k < aHeaders.length; k++) {
                var av = aData[j][k];
                line[aHeaders[k]] = av instanceof Date ? av.toISOString() : av;
              }
              session.appliances.push(line);
            }
          }
        }
      }
    }

    return session;
  } catch (e) { return null; }
}

function _findRowByPk(sheet, pkCol, pkValue) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][pkCol] && data[i][pkCol].toString().trim() === pkValue.toString().trim()) {
      return i + 1; // 1-based row index
    }
  }
  return -1;
}

function _sessionToRow(session) {
  // column order must match roi_session sheet header
  return [
    session.session_id || '',
    session.created_by || '',
    session.created_at ? new Date(session.created_at) : new Date(),
    new Date(),
    session.status || 'draft',
    session.customer_label || '',
    Number(session.phase) || 1,
    session.authority || 'MEA',
    session.tariff_id || '',
    Number(session.monthly_bill) || 0,
    Number(session.monthly_kwh) || 0,
    Number(session.day_fraction) || 0,
    Number(session.day_kwh) || 0,
    Number(session.night_kwh) || 0,
    session.usage_source || 'default',
    session.include_fit === true || session.include_fit === 'TRUE',
    session.existing_solar === true || session.existing_solar === 'TRUE',
    session.assumption_id_fk || 'DEFAULT',
    session.selected_product_id_fk || '',
    Number(session.selected_kw) || 0,
    Number(session.selected_price) || 0,
    Number(session.selected_battery_kwh) || 0,
    Number(session.selected_payback_yr) || 0,
    Number(session.selected_npv25) || 0,
    Number(session.annual_saving_yr1) || 0,
    session.selected_plan_id_fk || '',
    Number(session.selected_term_months) || 0,
    Number(session.selected_down_percent) || 0,
    session.selected_rank_strategy || 'net',
    Number(session.monthly_installment) || 0,
    Number(session.monthly_saving) || 0,
    Number(session.monthly_net) || 0,
    Number(session.total_interest) || 0,
    session.notes || ''
  ];
}

function upsertRoiSession(session) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('roi_session');
    if (!sheet) return { status: 'error', message: 'Sheet roi_session not found' };

    // ensure sheet has headers
    var headerCheck = sheet.getRange(1, 1).getValue();
    if (!headerCheck) {
      var headers = [
        'session_id','created_by','created_at','last_updated','status',
        'customer_label','phase','authority','tariff_id','monthly_bill',
        'monthly_kwh','day_fraction','day_kwh','night_kwh','usage_source',
        'include_fit','existing_solar','assumption_id_fk',
        'selected_product_id_fk','selected_kw','selected_price','selected_battery_kwh',
        'selected_payback_yr','selected_npv25','annual_saving_yr1',
        'selected_plan_id_fk','selected_term_months','selected_down_percent',
        'selected_rank_strategy','monthly_installment','monthly_saving','monthly_net',
        'total_interest','notes'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    var sessionId = session.session_id;
    var isUpdate = false;
    var rowIndex = -1;

    if (sessionId) {
      rowIndex = _findRowByPk(sheet, 0, sessionId);
      if (rowIndex > 0) isUpdate = true;
    }

    if (!isUpdate) {
      sessionId = generateRunningID('roi_session', 'ROI-');
      session.session_id = sessionId;
    }

    session.last_updated = new Date().toISOString();
    if (!isUpdate) {
      try { session.created_by = Session.getActiveUser().getEmail(); } catch (e) { session.created_by = ''; }
    }

    var rowData = _sessionToRow(session);

    if (isUpdate) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    // invalidate bootstrap cache since session data changed
    try { CacheService.getScriptCache().remove('roi_bootstrap_v1'); } catch (e) {}

    return { status: 'success', session_id: sessionId };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function addApplianceLine(sessionId, line) {
  if (!sessionId) return { status: 'error', message: 'Missing session_id' };
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('roi_session_appliance');
    if (!sheet) return { status: 'error', message: 'Sheet roi_session_appliance not found' };

    var headerCheck = sheet.getRange(1, 1).getValue();
    if (!headerCheck) {
      var headers = [
        'row_id','session_id_fk','appliance_id_fk','custom_name',
        'quantity','watts','day_hours','night_hours','inverter','duty_cycle',
        'kwh_day_per_month','kwh_night_per_month'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }

    var rowId = generateRunningID('roi_session_appliance', 'RSA-');
    var rowData = [
      rowId,
      sessionId,
      line.appliance_id_fk || '',
      line.custom_name || '',
      Number(line.quantity) || 1,
      Number(line.watts) || 0,
      Number(line.day_hours) || 0,
      Number(line.night_hours) || 0,
      line.inverter === true || line.inverter === 'TRUE',
      Number(line.duty_cycle) || 1,
      Number(line.kwh_day_per_month) || 0,
      Number(line.kwh_night_per_month) || 0
    ];
    sheet.appendRow(rowData);

    return { status: 'success', row_id: rowId };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function deleteApplianceLine(rowId) {
  if (!rowId) return { status: 'error', message: 'Missing row_id' };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('roi_session_appliance');
    if (!sheet) return { status: 'error', message: 'Sheet not found' };
    var rowIndex = _findRowByPk(sheet, 0, rowId);
    if (rowIndex < 0) return { status: 'error', message: 'Row not found' };
    sheet.deleteRow(rowIndex);
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function closeSession(sessionId) {
  if (!sessionId) return { status: 'error', message: 'Missing session_id' };
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('roi_session');
    if (!sheet) return { status: 'error', message: 'Sheet not found' };

    var rowIndex = _findRowByPk(sheet, 0, sessionId);
    if (rowIndex < 0) return { status: 'error', message: 'Session not found' };

    // find status column index
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return h.toString().trim(); });
    var statusIdx = headers.indexOf('status');
    var updatedIdx = headers.indexOf('last_updated');

    if (statusIdx >= 0) {
      sheet.getRange(rowIndex, statusIdx + 1).setValue('closed');
    }
    if (updatedIdx >= 0) {
      sheet.getRange(rowIndex, updatedIdx + 1).setValue(new Date());
    }
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function inferKwhFromBill(params) {
  var bill = Number(params.bill) || 0;
  var authority = params.authority || 'MEA';

  if (bill <= 0) return { kWh: 0, avgRate: 0, tariff_id: '' };

  try {
    var tariffs = _sheetToObjects(ROI_SHEETS.tariffs);
    tariffs = tariffs.filter(function(t) {
      return (t.status === 'active' || t.status === 'Active') && t.authority === authority;
    });

    if (tariffs.length === 0) return { kWh: 0, avgRate: 0, tariff_id: '' };

    // group by tariff_code
    var codes = {};
    tariffs.forEach(function(t) {
      if (!codes[t.tariff_code]) codes[t.tariff_code] = [];
      codes[t.tariff_code].push(t);
    });

    // bisection: find kWh where progressive_bill(kWh) ≈ bill
    // try each tariff_code, pick the one where result makes sense (kWh >= 0)
    var bestResult = null;
    var bestDiff = Infinity;

    for (var code in codes) {
      var tiers = codes[code].sort(function(a, b) { return a.from_kwh - b.from_kwh; });
      var serviceCharge = tiers[0].service_charge || 0;

      var lo = 0, hi = 5000;
      for (var iter = 0; iter < 50; iter++) {
        var mid = (lo + hi) / 2;
        var calcBill = _calcProgressiveBill(mid, tiers, serviceCharge);
        if (calcBill < bill) { lo = mid; } else { hi = mid; }
      }
      var kWh = Math.round((lo + hi) / 2 * 100) / 100;
      var calcBillFinal = _calcProgressiveBill(kWh, tiers, serviceCharge);
      var diff = Math.abs(calcBillFinal - bill);

      if (diff < bestDiff) {
        bestDiff = diff;
        bestResult = {
          kWh: kWh,
          avgRate: kWh > 0 ? Math.round(calcBillFinal / kWh * 10000) / 10000 : 0,
          tariff_id: tiers[0].tariff_id
        };
      }
    }

    return bestResult || { kWh: 0, avgRate: 0, tariff_id: '' };
  } catch (e) {
    return { kWh: 0, avgRate: 0, tariff_id: '' };
  }
}

function _calcProgressiveBill(kWh, tiers, serviceCharge) {
  var total = serviceCharge;
  var remaining = kWh;
  for (var i = 0; i < tiers.length; i++) {
    if (remaining <= 0) break;
    var from = Number(tiers[i].from_kwh);
    var to = Number(tiers[i].to_kwh);
    var rate = Number(tiers[i].rate_per_kwh);
    var ft = Number(tiers[i].ft_charge) || 0;
    var blockSize = Math.min(remaining, to - from + 1);
    total += blockSize * (rate + ft);
    remaining -= blockSize;
  }
  return total;
}

// ==================== ROI Helper — Diagnostics ====================

// Run this from the GAS editor (Run > diagRoi) to verify sheets are present.
// Returns a report of which required sheets exist and their row counts.
function diagRoi() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var required = [
    'appliance_preset',
    'solar_products',
    'financing_plan',
    'financing_rate_tier',
    'rate_benchmark',
    'roi_assumption',
    'electricity_tariff',
    'roi_session',
    'roi_session_appliance'
  ];
  var report = { spreadsheetUrl: ss.getUrl(), sheets: {} };
  required.forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (s) {
      var lastRow = s.getLastRow();
      var lastCol = s.getLastColumn();
      var headers = lastRow >= 1 ? s.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      report.sheets[name] = {
        exists: true,
        rows: lastRow,
        dataRows: Math.max(0, lastRow - 1),
        cols: lastCol,
        headers: headers
      };
    } else {
      report.sheets[name] = { exists: false };
    }
  });
  // Cache state
  try {
    var cache = CacheService.getScriptCache();
    var v1 = cache.get('roi_bootstrap_v1');
    var v2 = cache.get('roi_bootstrap_v2');
    report.cache = {
      v1: v1 ? 'cached (' + v1.length + ' chars)' : 'empty',
      v2: v2 ? 'cached (' + v2.length + ' chars)' : 'empty'
    };
  } catch (ce) {
    report.cache = { error: ce.message };
  }
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// Diagnose what getBootstrapData actually returns. Run from GAS editor.
function diagBootstrap() {
  try {
    var data = getBootstrapData();
    var summary = {
      keys: Object.keys(data),
      counts: {},
      sample: {}
    };
    Object.keys(data).forEach(function(k) {
      var arr = data[k];
      summary.counts[k] = Array.isArray(arr) ? arr.length : ('not-array: ' + typeof arr);
      if (Array.isArray(arr) && arr.length > 0) {
        summary.sample[k] = arr[0];
      }
    });
    summary.totalSizeBytes = JSON.stringify(data).length;
    Logger.log(JSON.stringify(summary, null, 2));
    return summary;
  } catch (e) {
    var err = { error: e.message, stack: e.stack };
    Logger.log(JSON.stringify(err, null, 2));
    return err;
  }
}

// Clear the ROI bootstrap cache (run from GAS editor after editing seed sheets).
function clearRoiCache() {
  try {
    var c = CacheService.getScriptCache();
    c.remove('roi_bootstrap_v1');
    c.remove('roi_bootstrap_v2');
    Logger.log('ROI bootstrap cache cleared.');
    return { status: 'ok', message: 'cache cleared' };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}
