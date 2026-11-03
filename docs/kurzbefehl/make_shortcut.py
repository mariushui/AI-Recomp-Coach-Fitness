#!/usr/bin/env python3
"""Erzeugt die Kurzbefehl-Datei "Recomp Health" (Stufe 1) als unsignierte .shortcut-Datei.

Aufruf:  python3 make_shortcut.py TOKEN ADRESSE
Danach auf dem Mac signieren:  shortcuts sign --mode anyone --input "Recomp Health.shortcut" --output "Recomp Health signed.shortcut"
und per AirDrop aufs iPhone schicken.

Stufe 1: Gewicht, Körperfett, Ruhepuls, HRV, Schlaf. Jeder Lauf sendet die letzten Werte, der Server
speichert pro Kennzahl und Tag genau einen Wert und überschreibt ihn (siehe docs/KURZBEFEHL.md).
"""
import plistlib, sys, uuid

OBJ = "￼"  # Platzhalter für eingefügte Variablen in Textfeldern

def text_with_vars(parts):
    """parts: Liste aus str oder ('var', NAME) oder ('out', UUID, OUTPUTNAME)"""
    s = ""
    att = {}
    for p in parts:
        if isinstance(p, str):
            s += p
        else:
            att[f"{{{len(s)}, 1}}"] = (
                {"Type": "Variable", "VariableName": p[1]}
                if p[0] == "var"
                else {"Type": "ActionOutput", "OutputUUID": p[1], "OutputName": p[2]}
            )
            s += OBJ
    return {"Value": {"string": s, "attachmentsByRange": att}, "WFSerializationType": "WFTextTokenString"}

def plain(s):
    return {"Value": {"string": s, "attachmentsByRange": {}}, "WFSerializationType": "WFTextTokenString"}

def action(ident, params, out_uuid=None):
    p = dict(params)
    if out_uuid:
        p["UUID"] = out_uuid
    return {"WFWorkflowActionIdentifier": ident, "WFWorkflowActionParameters": p}

def ref(out_uuid, name):
    return {"Value": {"OutputUUID": out_uuid, "OutputName": name, "Type": "ActionOutput"}, "WFSerializationType": "WFTextTokenAttachment"}

actions = []

def find(sample_type, limit):
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.filter.health.quantity", {
        "WFHealthSampleType": sample_type,
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Latest First",
        "WFContentItemLimitEnabled": True,
        "WFContentItemLimitNumber": limit,
    }, u))
    return u

def detail(find_uuid, prop):
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.properties.health.quantity", {
        "WFContentItemPropertyName": prop,
        "WFInput": ref(find_uuid, "Health Samples"),
    }, u))
    return u

def fmt_date():
    actions.append(action("is.workflow.actions.format.date", {"WFDateFormatStyle": "ISO 8601", "WFISO8601IncludeTime": True}))

def setvar(name):
    actions.append(action("is.workflow.actions.setvariable", {"WFVariableName": name}))

def point_block(sample_type, value_var, date_var, limit=10):
    f = find(sample_type, limit)
    detail(f, "Value"); setvar(value_var)
    detail(f, "Start Date"); fmt_date(); setvar(date_var)

point_block("Weight", "GW", "GD")
point_block("Body Fat Percentage", "KW", "KD")
point_block("Resting Heart Rate", "RW", "RD")
point_block("Heart Rate Variability", "HW", "HD", limit=40)
f = find("Sleep Analysis", 80)
detail(f, "Value"); setvar("SW")
detail(f, "Start Date"); fmt_date(); setvar("SS")
detail(f, "End Date"); fmt_date(); setvar("SE")

def dict_field(key, value):
    return {"WFItemType": 0, "WFKey": plain(key), "WFValue": value}

def dict_of(items):
    return {"WFItemType": 1, "WFKey": plain(""), "WFValue": {"Value": {"WFDictionaryFieldValueItems": items}, "WFSerializationType": "WFDictionaryFieldValue"}}

def sub(key, fields):
    d = dict_of([dict_field(k, text_with_vars([("var", v)])) for k, v in fields])
    d["WFKey"] = plain(key)
    return d

token = sys.argv[1] if len(sys.argv) > 1 else "rc_HIER_DEIN_TOKEN"
url = sys.argv[2] if len(sys.argv) > 2 else "https://DEIN-PROJEKT.supabase.co/functions/v1/health-ingest"
metrics = dict_of([
    sub("weight", [("values", "GW"), ("dates", "GD")]),
    sub("body_fat", [("values", "KW"), ("dates", "KD")]),
    sub("resting_hr", [("values", "RW"), ("dates", "RD")]),
    sub("hrv", [("values", "HW"), ("dates", "HD")]),
    sub("sleep", [("values", "SW"), ("starts", "SS"), ("ends", "SE")]),
])
metrics["WFKey"] = plain("metrics")
dl = str(uuid.uuid4()).upper()
actions.append(action("is.workflow.actions.downloadurl", {
    "WFURL": url,
    "WFHTTPMethod": "POST",
    "WFHTTPBodyType": "JSON",
    "WFHTTPHeaders": {"Value": {"WFDictionaryFieldValueItems": [dict_field("x-recomp-token", plain(token))]}, "WFSerializationType": "WFDictionaryFieldValue"},
    "WFJSONValues": {"Value": {"WFDictionaryFieldValueItems": [metrics]}, "WFSerializationType": "WFDictionaryFieldValue"},
    "ShowHeaders": True,
}, dl))
gv = str(uuid.uuid4()).upper()
actions.append(action("is.workflow.actions.getvalueforkey", {
    "WFGetDictionaryKey": "summary",
    "WFGetDictionaryValueType": "Value",
    "WFInput": ref(dl, "Contents of URL"),
}, gv))
actions.append(action("is.workflow.actions.notification", {
    "WFNotificationActionBody": text_with_vars([("out", gv, "Dictionary Value")]),
    "WFNotificationActionSound": False,
}))

wf = {
    "WFWorkflowClientVersion": "2607.0.3",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowIcon": {"WFWorkflowIconStartColor": 2071128575, "WFWorkflowIconGlyphNumber": 59511},
    "WFWorkflowTypes": ["NCWidget", "WatchKit"],
    "WFWorkflowInputContentItemClasses": ["WFAppContentItem", "WFArticleContentItem", "WFContactContentItem", "WFDateContentItem", "WFEmailAddressContentItem", "WFGenericFileContentItem", "WFImageContentItem", "WFLocationContentItem", "WFDCMapsLinkContentItem", "WFAVAssetContentItem", "WFPDFContentItem", "WFPhoneNumberContentItem", "WFRichTextContentItem", "WFSafariWebPageContentItem", "WFStringContentItem", "WFURLContentItem"],
    "WFWorkflowImportQuestions": [],
    "WFWorkflowHasShortcutInputVariables": False,
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowOutputContentItemClasses": [],
    "WFWorkflowActions": actions,
}
out = "Recomp Health.shortcut"
with open(out, "wb") as f:
    plistlib.dump(wf, f, fmt=plistlib.FMT_BINARY)
print(f"{out}: {len(actions)} Aktionen")
