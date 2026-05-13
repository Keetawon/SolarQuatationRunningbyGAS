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

// ============================= ROI Helper Backend =============================

function getBootstrapRoiData() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('roi_bootstrap_v1');
    if (cached) return JSON.parse(cached);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {
      appliances: [],
      solarProducts: [],
      financingPlans: [],
      financingRateTiers: [],
      rateBenchmarks: {},
      roiAssumptions: {},
      electricityTariffs: []
    };

    var aSheet = ss.getSheetByName('appliance_preset');
    if (aSheet) {
      var aData = aSheet.getDataRange().getValues();
      result.appliances = aData.slice(1).filter(function(r) {
        return r[0] && r[11] !== 'inactive';
      }).map(function(r) {
        return {
          appliance_id: String(r[0]),
          name_th: String(r[1]),
          name_en: String(r[2] || ''),
          category: String(r[3] || ''),
          default_watts: Number(r[4]) || 0,
          watt_options: String(r[5] || ''),
          inverter: r[6] === true || r[6] === 'TRUE',
          typical_day_hours: Number(r[7]) || 0,
          typical_night_hours: Number(r[8]) || 0,
          typical_duty_cycle: Number(r[9]) || 1
        };
      });
    }

    var spSheet = ss.getSheetByName('solar_products');
    if (spSheet) {
      var spData = spSheet.getDataRange().getValues();
      result.solarProducts = spData.slice(1).filter(function(r) {
        return r[0] && r[8] !== 'inactive';
      }).map(function(r) {
        return {
          product_id: String(r[0]),
          name: String(r[1]),
          type: String(r[2] || 'on-grid'),
          kw: Number(r[3]) || 0,
          price: Number(r[4]) || 0,
          battery_kwh: Number(r[5]) || 0,
          electric_phase: Number(r[6]) || 1,
          self_consume: Number(r[7]) || 0.55
        };
      });
    }

    var fpSheet = ss.getSheetByName('financing_plan');
    if (fpSheet) {
      var fpData = fpSheet.getDataRange().getValues();
      result.financingPlans = fpData.slice(1).filter(function(r) {
        return r[0] && r[24] !== 'inactive';
      }).map(function(r) {
        return {
          plan_id: String(r[0]),
          bank_code: String(r[1] || ''),
          bank_label_th: String(r[2] || ''),
          product_name_th: String(r[3] || ''),
          financing_type: String(r[5] || ''),
          rate_type: String(r[6] || 'flat'),
          rate_basis: String(r[7] || 'fixed'),
          rate_reference: String(r[8] || ''),
          term_min_months: Number(r[9]) || 0,
          term_max_months: Number(r[10]) || 240,
          term_step_months: Number(r[11]) || 12,
          price_min: Number(r[12]) || 0,
          price_max: Number(r[13]) || 9999999,
          down_percent_options: String(r[14] || '0'),
          processing_fee: Number(r[15]) || 0,
          monthly_fee: Number(r[16]) || 0,
          tax_deduction_eligible: r[17] === true || r[17] === 'TRUE',
          requires_collateral: r[18] === true || r[18] === 'TRUE',
          requires_credit_card_of_bank: r[20] === true || r[20] === 'TRUE',
          recommend_tags: String(r[21] || ''),
          note_th: String(r[23] || '')
        };
      });
    }

    var frtSheet = ss.getSheetByName('financing_rate_tier');
    if (frtSheet) {
      var frtData = frtSheet.getDataRange().getValues();
      result.financingRateTiers = frtData.slice(1).filter(function(r) {
        return r[0];
      }).map(function(r) {
        return {
          tier_id: String(r[0]),
          plan_id: String(r[1]),
          applies_to_term_months: String(r[2] || '*'),
          applies_to_down_percent: String(r[3] || '*'),
          from_month: Number(r[4]) || 1,
          to_month: Number(r[5]) || 9999,
          rate_type_override: String(r[6] || ''),
          rate_value: (r[7] !== '' && r[7] !== null && r[7] !== undefined) ? Number(r[7]) : null,
          reference_offset: (r[8] !== '' && r[8] !== null && r[8] !== undefined) ? Number(r[8]) : null,
          sequence: Number(r[9]) || 1,
          note_th: String(r[10] || '')
        };
      });
    }

    var rbSheet = ss.getSheetByName('rate_benchmark');
    if (rbSheet) {
      var rbData = rbSheet.getDataRange().getValues();
      rbData.slice(1).forEach(function(r) {
        if (r[0] && r[4] !== 'archived') {
          result.rateBenchmarks[String(r[0])] = Number(r[1]) || 0;
        }
      });
    }

    var raSheet = ss.getSheetByName('roi_assumption');
    if (raSheet) {
      var raData = raSheet.getDataRange().getValues();
      raData.slice(1).forEach(function(r) {
        if (r[0] && r[15] !== 'inactive') {
          result.roiAssumptions[String(r[0])] = {
            assumption_id: String(r[0]),
            region: String(r[1] || ''),
            peak_sun_hours: Number(r[2]) || 4.5,
            performance_ratio: Number(r[3]) || 0.85,
            panel_degradation_yr: Number(r[4]) || 0.005,
            system_life_yr: Number(r[5]) || 25,
            battery_dod: Number(r[6]) || 0.9,
            battery_round_trip: Number(r[7]) || 0.92,
            electricity_escalation_yr: Number(r[10]) || 0.03,
            discount_rate: Number(r[11]) || 0.05,
            fit_price: Number(r[12]) || 2.2,
            maintenance_yr: Number(r[13]) || 3500,
            vat_rate: Number(r[14]) || 0.07
          };
        }
      });
    }

    var etSheet = ss.getSheetByName('electricity_tariff');
    if (etSheet) {
      var etData = etSheet.getDataRange().getValues();
      result.electricityTariffs = etData.slice(1).filter(function(r) {
        return r[0] && r[10] !== 'inactive';
      }).map(function(r) {
        return {
          tariff_id: String(r[0]),
          authority: String(r[1]),
          tariff_code: String(r[2]),
          from_kwh: Number(r[4]) || 0,
          to_kwh: Number(r[5]) || 999999,
          rate_per_kwh: Number(r[6]) || 0,
          ft_charge: Number(r[7]) || 0,
          service_charge: Number(r[8]) || 0
        };
      });
    }

    try { cache.put('roi_bootstrap_v1', JSON.stringify(result), 600); } catch (ce) {}
    return result;
  } catch (e) {
    return { error: e.message };
  }
}

function saveRoiSession(sessionData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('roi_session');
    if (!sheet) {
      sheet = ss.insertSheet('roi_session');
      sheet.appendRow(['session_id','created_by','created_at','last_updated','status','customer_label','phase','authority','tariff_id','monthly_bill','monthly_kwh','day_fraction','day_kwh','night_kwh','usage_source','include_fit','existing_solar','assumption_id_fk','selected_product_id_fk','selected_kw','selected_price','selected_battery_kwh','selected_payback_yr','selected_npv25','annual_saving_yr1','selected_plan_id_fk','selected_term_months','selected_down_percent','selected_rank_strategy','monthly_installment','monthly_saving','monthly_net','total_interest','notes']);
    }

    var now = new Date();
    var sessionId = sessionData.session_id || '';
    var isUpdate = false;
    var rowIndex = -1;

    if (sessionId) {
      var existing = sheet.getDataRange().getValues();
      for (var i = 1; i < existing.length; i++) {
        if (existing[i][0] && existing[i][0].toString() === sessionId) {
          isUpdate = true;
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (!isUpdate) {
      sessionId = generateRunningID('roi_session', 'ROI');
    }

    var userEmail = '-';
    try { userEmail = Session.getActiveUser().getEmail(); } catch (ue) {}

    var row = [
      sessionId,
      userEmail,
      now,
      now,
      sessionData.status || 'draft',
      sessionData.customer_label || '',
      sessionData.phase || 1,
      sessionData.authority || 'MEA',
      sessionData.tariff_id || '',
      Number(sessionData.monthly_bill) || 0,
      Number(sessionData.monthly_kwh) || 0,
      Number(sessionData.day_fraction) || 0,
      Number(sessionData.day_kwh) || 0,
      Number(sessionData.night_kwh) || 0,
      sessionData.usage_source || '',
      sessionData.include_fit ? true : false,
      sessionData.existing_solar ? true : false,
      sessionData.assumption_id_fk || 'DEFAULT',
      sessionData.selected_product_id_fk || '',
      Number(sessionData.selected_kw) || 0,
      Number(sessionData.selected_price) || 0,
      Number(sessionData.selected_battery_kwh) || 0,
      Number(sessionData.selected_payback_yr) || 0,
      Number(sessionData.selected_npv25) || 0,
      Number(sessionData.annual_saving_yr1) || 0,
      sessionData.selected_plan_id_fk || '',
      Number(sessionData.selected_term_months) || 0,
      Number(sessionData.selected_down_percent) || 0,
      sessionData.selected_rank_strategy || 'net',
      Number(sessionData.monthly_installment) || 0,
      Number(sessionData.monthly_saving) || 0,
      Number(sessionData.monthly_net) || 0,
      Number(sessionData.total_interest) || 0,
      sessionData.notes || ''
    ];

    if (isUpdate) {
      var existingRow = sheet.getRange(rowIndex, 1, 1, 3).getValues()[0];
      row[1] = existingRow[1];
      row[2] = existingRow[2];
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    if (sessionData.appliances && sessionData.appliances.length > 0) {
      _saveRoiSessionAppliances(ss, sessionId, sessionData.appliances);
    }

    return { status: 'success', session_id: sessionId };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

function _saveRoiSessionAppliances(ss, sessionId, appliances) {
  var sheet = ss.getSheetByName('roi_session_appliance');
  if (!sheet) {
    sheet = ss.insertSheet('roi_session_appliance');
    sheet.appendRow(['row_id','session_id_fk','appliance_id_fk','custom_name','quantity','watts','day_hours','night_hours','inverter','duty_cycle','kwh_day_per_month','kwh_night_per_month']);
  }
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][1] && data[i][1].toString() === sessionId) {
      sheet.deleteRow(i + 1);
    }
  }
  appliances.forEach(function(a) {
    sheet.appendRow([
      'RSA-' + sessionId + '-' + Utilities.getUuid().substring(0, 8),
      sessionId,
      a.appliance_id_fk || '',
      a.custom_name || '',
      Number(a.quantity) || 1,
      Number(a.watts) || 0,
      Number(a.day_hours) || 0,
      Number(a.night_hours) || 0,
      a.inverter ? true : false,
      Number(a.duty_cycle) || 1,
      Number(a.kwh_day_per_month) || 0,
      Number(a.kwh_night_per_month) || 0
    ]);
  });
}

function searchRoiSessions(query) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('roi_session');
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    var q = (query || '').toString().trim().toLowerCase();
    return data.slice(1).filter(function(row) {
      if (!row[0]) return false;
      var label = (row[5] || '').toString().toLowerCase();
      var id = (row[0] || '').toString().toLowerCase();
      return !q || label.indexOf(q) >= 0 || id.indexOf(q) >= 0;
    }).map(function(row) {
      return {
        session_id: String(row[0]),
        customer_label: String(row[5] || ''),
        status: String(row[4] || 'draft'),
        last_updated: row[3] instanceof Date ? row[3].toISOString() : String(row[3] || ''),
        selected_product_id_fk: String(row[18] || ''),
        monthly_net: Number(row[31]) || 0
      };
    }).slice(0, 20);
  } catch (e) {
    return [];
  }
}

function loadRoiSession(sessionId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('roi_session');
    if (!sheet) return null;
    var data = sheet.getDataRange().getValues();
    var COLS = ['session_id','created_by','created_at','last_updated','status','customer_label','phase','authority','tariff_id','monthly_bill','monthly_kwh','day_fraction','day_kwh','night_kwh','usage_source','include_fit','existing_solar','assumption_id_fk','selected_product_id_fk','selected_kw','selected_price','selected_battery_kwh','selected_payback_yr','selected_npv25','annual_saving_yr1','selected_plan_id_fk','selected_term_months','selected_down_percent','selected_rank_strategy','monthly_installment','monthly_saving','monthly_net','total_interest','notes'];
    for (var i = 1; i < data.length; i++) {
      if (!data[i][0] || data[i][0].toString() !== sessionId) continue;
      var obj = {};
      COLS.forEach(function(h, idx) {
        var v = data[i][idx];
        obj[h] = v instanceof Date ? v.toISOString() : (v !== undefined ? v : '');
      });
      var aSheet = ss.getSheetByName('roi_session_appliance');
      if (aSheet) {
        var aData = aSheet.getDataRange().getValues();
        obj.appliances = aData.slice(1).filter(function(r) {
          return r[1] && r[1].toString() === sessionId;
        }).map(function(r) {
          return {
            appliance_id_fk: String(r[2] || ''),
            custom_name: String(r[3] || ''),
            quantity: Number(r[4]) || 1,
            watts: Number(r[5]) || 0,
            day_hours: Number(r[6]) || 0,
            night_hours: Number(r[7]) || 0,
            inverter: r[8] === true || r[8] === 'TRUE',
            duty_cycle: Number(r[9]) || 1
          };
        });
      } else {
        obj.appliances = [];
      }
      return obj;
    }
    return null;
  } catch (e) {
    return { error: e.message };
  }
}
