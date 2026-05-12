# Proposed Schemas — Sales ROI Helper

ไฟล์ในโฟลเดอร์นี้คือ **schema ที่เสนอ** (ยังไม่ถูก migrate เข้า Google Sheet จริง)
อ่านคู่กับ `../docs/sales_roi_helper_design.md`

## รายการไฟล์

| ไฟล์ | บทบาท | แทนที่ของเดิม |
|---|---|---|
| `financing_plan.csv` | parent ของแผนสินเชื่อ (10 plan ตัวอย่าง) | `../installment_plan_ex.xlsx` (เดิม 49 rows flat) |
| `financing_rate_tier.csv` | child — อัตราดอกเบี้ยเป็นช่วง ๆ (รองรับ teaser/stepped) | (ไม่มีของเดิม) |
| `rate_benchmark.csv` | MRR/MLR/MOR/EIR | (ไม่มีของเดิม) |
| `appliance_preset.csv` | preset เครื่องใช้ไฟฟ้า 30 รายการ | (ไม่มีของเดิม) |
| `electricity_tariff.csv` | tariff MEA/PEA แบบขั้นบันได | (ไม่มีของเดิม) |
| `roi_assumption.csv` | ค่าตั้งต้น ROI engine (รวม per region) | สูตรใน `Solar_ROI_Calculator_v3.xlsx` |
| `recommend_rule.csv` | กฎ recommend ระบบ + สินเชื่อ | (ไม่มีของเดิม) |

## ตัวอย่างเด่น — Teaser rate ใน `financing_rate_tier.csv`

แผน `PLN-2025-ICBC-TEASER` term 60 เดือน ดอกเบี้ยปีที่ 1 = 0.99%, ปีที่ 2-5 = 4.99%:

```
TIR-ICBC-TEASER-60-Y1,PLN-2025-ICBC-TEASER,60,*,1,12,,0.0099,,1,ปีที่ 1: อัตราโปรโมชั่น 0.99%
TIR-ICBC-TEASER-60-Y2P,PLN-2025-ICBC-TEASER,60,*,13,60,,0.0499,,2,ปีที่ 2-5: อัตราปกติ 4.99%
```

แผน `PLN-2025-BBL-HE` ผูก MRR-1.00 (reducing balance):

```
TIR-BBL-HE-ALL,PLN-2025-BBL-HE,*,*,1,240,,,-0.01,1,MRR-1.00 ตลอดสัญญา 20 ปี
```

→ ตอน runtime: rate = `rate_benchmark` ที่ `code=MRR` × value + offset `-0.01`

## วิธี import เข้า Google Sheet (เมื่อ approve แล้ว)

แต่ละ CSV → สร้าง sheet ชื่อตามไฟล์ใน Spreadsheet ที่ผูกกับ Code.gs
ใช้ `File > Import > Upload > Replace current sheet` แล้วเลือกไฟล์ CSV

## หมายเหตุ

- ตัวเลข `MRR=0.066`, `MLR=0.064` ใน `rate_benchmark.csv` เป็นค่าตัวอย่าง — ต้องอัปเดตให้ตรงประกาศจริงของแต่ละแบงค์
- `electricity_tariff.csv` อิงโครงสร้าง MEA/PEA TYPE 1.1.1/1.1.2 ปัจจุบัน; FT charge ต้องอัปเดตทุก 4 เดือน
- `recommend_rule.csv` ใช้ `condition_json` แบบ JSON string — engine จะ `JSON.parse` แล้ว match
