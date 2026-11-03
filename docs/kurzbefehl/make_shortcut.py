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

def find(sample_type, limit, days=7):
    """Health-Messungen suchen. Aufbau wie von iOS selbst gespeichert (aus einem iCloud-Export abgelesen):
    Typ und Zeitraum sind Filterbedingungen, kein eigenes Feld."""
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.filter.health.quantity", {
        "WFContentItemFilter": {
            "Value": {
                "WFActionParameterFilterPrefix": 1,
                "WFContentPredicateBoundedDate": False,
                "WFActionParameterFilterTemplates": [
                    {
                        "Property": "Type",
                        "Operator": 4,
                        "Bounded": True,
                        "Removable": False,
                        "Values": {"Enumeration": {"Value": sample_type, "WFSerializationType": "WFStringSubstitutableState"}},
                    },
                    {
                        "Property": "Start Date",
                        "Operator": 1001,  # ist innerhalb der letzten
                        "Bounded": True,
                        "Removable": False,
                        "Values": {"Number": str(days), "Unit": 16},  # 16 = Tage
                    },
                ],
            },
            "WFSerializationType": "WFContentPredicateTableTemplate",
        },
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
        "WFInput": ref(find_uuid, "Health-Messungen"),
    }, u))
    return u

def fmt_date(src_uuid, src_name):
    u = str(uuid.uuid4()).upper()
    actions.append(action("is.workflow.actions.format.date", {
        "WFDate": ref(src_uuid, src_name),
        "WFDateFormatStyle": "ISO 8601",
        "WFISO8601IncludeTime": True,
    }, u))
    return u

def setvar(name, src_uuid, src_name):
    actions.append(action("is.workflow.actions.setvariable", {
        "WFVariableName": name,
        "WFInput": ref(src_uuid, src_name),
    }))

def point_block(sample_type, value_var, date_var, limit=10):
    f = find(sample_type, limit)
    v = detail(f, "Value"); setvar(value_var, v, "Wert")
    d = detail(f, "Start Date"); fd = fmt_date(d, "Startdatum"); setvar(date_var, fd, "Formatiertes Datum")

point_block("Weight", "GW", "GD")
point_block("Body Fat Percentage", "KW", "KD")
point_block("Resting Heart Rate", "RW", "RD")
point_block("Heart Rate Variability", "HW", "HD", limit=40)
f = find("Sleep", 80)
v = detail(f, "Value"); setvar("SW", v, "Wert")
d = detail(f, "Start Date"); fd = fmt_date(d, "Startdatum"); setvar("SS", fd, "Formatiertes Datum")
d = detail(f, "End Date"); fd = fmt_date(d, "Enddatum"); setvar("SE", fd, "Formatiertes Datum")

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
    "WFDictionaryKey": "summary",
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
