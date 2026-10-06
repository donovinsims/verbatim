import { t as anynum } from "./anynum.mjs";
//#region node_modules/fast-xml-parser/src/util.js
var nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
var nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
"" + nameStartChar + nameChar;
var regexName = /* @__PURE__ */ new RegExp("^[:A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$");
function getAllMatches(string, regex) {
	const matches = [];
	let match = regex.exec(string);
	while (match) {
		const allmatches = [];
		allmatches.startIndex = regex.lastIndex - match[0].length;
		const len = match.length;
		for (let index = 0; index < len; index++) allmatches.push(match[index]);
		matches.push(allmatches);
		match = regex.exec(string);
	}
	return matches;
}
var isName = function(string) {
	const match = regexName.exec(string);
	return !(match === null || typeof match === "undefined");
};
function isExist(v) {
	return typeof v !== "undefined";
}
//#endregion
//#region node_modules/fast-xml-parser/src/validator.js
var defaultOptions$1 = {
	allowBooleanAttributes: false,
	unpairedTags: []
};
function validate(xmlData, options) {
	options = Object.assign({}, defaultOptions$1, options);
	const tags = [];
	let tagFound = false;
	let reachedRoot = false;
	if (xmlData[0] === "﻿") xmlData = xmlData.substr(1);
	for (let i = 0; i < xmlData.length; i++) if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
		i += 2;
		i = readPI(xmlData, i);
		if (i.err) return i;
	} else if (xmlData[i] === "<") {
		let tagStartPos = i;
		i++;
		if (xmlData[i] === "!") {
			i = readCommentAndCDATA(xmlData, i);
			continue;
		} else {
			let closingTag = false;
			if (xmlData[i] === "/") {
				closingTag = true;
				i++;
			}
			let tagName = "";
			for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) tagName += xmlData[i];
			tagName = tagName.trim();
			if (tagName[tagName.length - 1] === "/") {
				tagName = tagName.substring(0, tagName.length - 1);
				i--;
			}
			if (!validateTagName(tagName)) {
				let msg;
				if (tagName.trim().length === 0) msg = "Invalid space after '<'.";
				else msg = "Tag '" + tagName + "' is an invalid name.";
				return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
			}
			const result = readAttributeStr(xmlData, i);
			if (result === false) return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
			let attrStr = result.value;
			i = result.index;
			if (attrStr[attrStr.length - 1] === "/") {
				const attrStrStart = i - attrStr.length;
				attrStr = attrStr.substring(0, attrStr.length - 1);
				const isValid = validateAttributeString(attrStr, options);
				if (isValid === true) tagFound = true;
				else return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
			} else if (closingTag) {
				if (!result.tagClosed) return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
				else if (attrStr.trim().length > 0) return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
				else if (tags.length === 0) return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
				else {
					const otg = tags.pop();
					if (tagName !== otg.tagName) {
						let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
						return getErrorObject("InvalidTag", "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.", getLineNumberForPosition(xmlData, tagStartPos));
					}
					if (tags.length == 0) reachedRoot = true;
				}
			} else {
				const isValid = validateAttributeString(attrStr, options);
				if (isValid !== true) return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
				if (reachedRoot === true) return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
				else if (options.unpairedTags.indexOf(tagName) !== -1) {} else tags.push({
					tagName,
					tagStartPos
				});
				tagFound = true;
			}
			for (i++; i < xmlData.length; i++) if (xmlData[i] === "<") {
				if (xmlData[i + 1] === "!") {
					i++;
					i = readCommentAndCDATA(xmlData, i);
					continue;
				} else if (xmlData[i + 1] === "?") {
					i = readPI(xmlData, ++i);
					if (i.err) return i;
				} else break;
			} else if (xmlData[i] === "&") {
				const afterAmp = validateAmpersand(xmlData, i);
				if (afterAmp == -1) return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
				i = afterAmp;
			} else if (reachedRoot === true && !isWhiteSpace(xmlData[i])) return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
			if (xmlData[i] === "<") i--;
		}
	} else {
		if (isWhiteSpace(xmlData[i])) continue;
		return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
	}
	if (!tagFound) return getErrorObject("InvalidXml", "Start tag expected.", 1);
	else if (tags.length == 1) return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
	else if (tags.length > 0) return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", {
		line: 1,
		col: 1
	});
	return true;
}
function isWhiteSpace(char) {
	return char === " " || char === "	" || char === "\n" || char === "\r";
}
/**
* Read Processing insstructions and skip
* @param {*} xmlData
* @param {*} i
*/
function readPI(xmlData, i) {
	const start = i;
	for (; i < xmlData.length; i++) if (xmlData[i] == "?" || xmlData[i] == " ") {
		const tagname = xmlData.substr(start, i - start);
		if (i > 5 && tagname === "xml") return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
		else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
			i++;
			break;
		} else continue;
	}
	return i;
}
function readCommentAndCDATA(xmlData, i) {
	if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
		for (i += 3; i < xmlData.length; i++) if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
			i += 2;
			break;
		}
	} else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
		let angleBracketsCount = 1;
		for (i += 8; i < xmlData.length; i++) if (xmlData[i] === "<") angleBracketsCount++;
		else if (xmlData[i] === ">") {
			angleBracketsCount--;
			if (angleBracketsCount === 0) break;
		}
	} else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
		for (i += 8; i < xmlData.length; i++) if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
			i += 2;
			break;
		}
	}
	return i;
}
var doubleQuote = "\"";
var singleQuote = "'";
/**
* Keep reading xmlData until '<' is found outside the attribute value.
* @param {string} xmlData
* @param {number} i
*/
function readAttributeStr(xmlData, i) {
	let attrStr = "";
	let startChar = "";
	let tagClosed = false;
	for (; i < xmlData.length; i++) {
		if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
			if (startChar === "") startChar = xmlData[i];
			else if (startChar !== xmlData[i]) {} else startChar = "";
		} else if (xmlData[i] === ">") {
			if (startChar === "") {
				tagClosed = true;
				break;
			}
		}
		attrStr += xmlData[i];
	}
	if (startChar !== "") return false;
	return {
		value: attrStr,
		index: i,
		tagClosed
	};
}
/**
* Select all the attributes whether valid or invalid.
*/
var validAttrStrRegxp = /* @__PURE__ */ new RegExp("(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['\"])(([\\s\\S])*?)\\5)?", "g");
function validateAttributeString(attrStr, options) {
	const matches = getAllMatches(attrStr, validAttrStrRegxp);
	const attrNames = {};
	for (let i = 0; i < matches.length; i++) {
		if (matches[i][1].length === 0) return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
		else if (matches[i][3] !== void 0 && matches[i][4] === void 0) return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
		else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
		const attrName = matches[i][2];
		if (!validateAttrName(attrName)) return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
		if (!attrNames.hasOwnProperty(attrName)) attrNames[attrName] = 1;
		else return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
	}
	return true;
}
function validateNumberAmpersand(xmlData, i) {
	let re = /\d/;
	if (xmlData[i] === "x") {
		i++;
		re = /[\da-fA-F]/;
	}
	for (; i < xmlData.length; i++) {
		if (xmlData[i] === ";") return i;
		if (!xmlData[i].match(re)) break;
	}
	return -1;
}
function validateAmpersand(xmlData, i) {
	i++;
	if (xmlData[i] === ";") return -1;
	if (xmlData[i] === "#") {
		i++;
		return validateNumberAmpersand(xmlData, i);
	}
	let count = 0;
	for (; i < xmlData.length; i++, count++) {
		if (xmlData[i].match(/\w/) && count < 20) continue;
		if (xmlData[i] === ";") break;
		return -1;
	}
	return i;
}
function getErrorObject(code, message, lineNumber) {
	return { err: {
		code,
		msg: message,
		line: lineNumber.line || lineNumber,
		col: lineNumber.col
	} };
}
function validateAttrName(attrName) {
	return isName(attrName);
}
function validateTagName(tagname) {
	return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
	const lines = xmlData.substring(0, index).split(/\r?\n/);
	return {
		line: lines.length,
		col: lines[lines.length - 1].length + 1
	};
}
function getPositionFromMatch(match) {
	return match.startIndex + match[1].length;
}
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
var defaultOptions = {
	preserveOrder: false,
	attributeNamePrefix: "@_",
	attributesGroupName: false,
	textNodeName: "#text",
	ignoreAttributes: true,
	removeNSPrefix: false,
	allowBooleanAttributes: false,
	parseTagValue: true,
	parseAttributeValue: false,
	trimValues: true,
	cdataPropName: false,
	numberParseOptions: {
		hex: true,
		leadingZeros: true,
		eNotation: true
	},
	tagValueProcessor: function(tagName, val) {
		return val;
	},
	attributeValueProcessor: function(attrName, val) {
		return val;
	},
	stopNodes: [],
	alwaysCreateTextNode: false,
	isArray: () => false,
	commentPropName: false,
	unpairedTags: [],
	processEntities: true,
	htmlEntities: false,
	ignoreDeclaration: false,
	ignorePiTags: false,
	transformTagName: false,
	transformAttributeName: false,
	updateTag: function(tagName, jPath, attrs) {
		return tagName;
	},
	captureMetaData: false
};
var buildOptions = function(options) {
	return Object.assign({}, defaultOptions, options);
};
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL$1;
if (typeof Symbol !== "function") METADATA_SYMBOL$1 = "@@xmlMetadata";
else METADATA_SYMBOL$1 = Symbol("XML Node Metadata");
var XmlNode = class {
	constructor(tagname) {
		this.tagname = tagname;
		this.child = [];
		this[":@"] = {};
	}
	add(key, val) {
		if (key === "__proto__") key = "#__proto__";
		this.child.push({ [key]: val });
	}
	addChild(node, startIndex) {
		if (node.tagname === "__proto__") node.tagname = "#__proto__";
		if (node[":@"] && Object.keys(node[":@"]).length > 0) this.child.push({
			[node.tagname]: node.child,
			[":@"]: node[":@"]
		});
		else this.child.push({ [node.tagname]: node.child });
		if (startIndex !== void 0) this.child[this.child.length - 1][METADATA_SYMBOL$1] = { startIndex };
	}
	/** symbol used for metadata */
	static getMetaDataSymbol() {
		return METADATA_SYMBOL$1;
	}
};
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
function readDocType(xmlData, i) {
	const entities = {};
	if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
		i = i + 9;
		let angleBracketsCount = 1;
		let hasBody = false, comment = false;
		let exp = "";
		for (; i < xmlData.length; i++) if (xmlData[i] === "<" && !comment) {
			if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
				i += 7;
				let entityName, val;
				[entityName, val, i] = readEntityExp(xmlData, i + 1);
				if (val.indexOf("&") === -1) entities[entityName] = {
					regx: RegExp(`&${entityName};`, "g"),
					val
				};
			} else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
				i += 8;
				const { index } = readElementExp(xmlData, i + 1);
				i = index;
			} else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) i += 8;
			else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
				i += 9;
				const { index } = readNotationExp(xmlData, i + 1);
				i = index;
			} else if (hasSeq(xmlData, "!--", i)) comment = true;
			else throw new Error(`Invalid DOCTYPE`);
			angleBracketsCount++;
			exp = "";
		} else if (xmlData[i] === ">") {
			if (comment) {
				if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
					comment = false;
					angleBracketsCount--;
				}
			} else angleBracketsCount--;
			if (angleBracketsCount === 0) break;
		} else if (xmlData[i] === "[") hasBody = true;
		else exp += xmlData[i];
		if (angleBracketsCount !== 0) throw new Error(`Unclosed DOCTYPE`);
	} else throw new Error(`Invalid Tag instead of DOCTYPE`);
	return {
		entities,
		i
	};
}
var skipWhitespace = (data, index) => {
	while (index < data.length && /\s/.test(data[index])) index++;
	return index;
};
function readEntityExp(xmlData, i) {
	i = skipWhitespace(xmlData, i);
	let entityName = "";
	while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== "\"" && xmlData[i] !== "'") {
		entityName += xmlData[i];
		i++;
	}
	validateEntityName(entityName);
	i = skipWhitespace(xmlData, i);
	if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") throw new Error("External entities are not supported");
	else if (xmlData[i] === "%") throw new Error("Parameter entities are not supported");
	let entityValue = "";
	[i, entityValue] = readIdentifierVal(xmlData, i, "entity");
	i--;
	return [
		entityName,
		entityValue,
		i
	];
}
function readNotationExp(xmlData, i) {
	i = skipWhitespace(xmlData, i);
	let notationName = "";
	while (i < xmlData.length && !/\s/.test(xmlData[i])) {
		notationName += xmlData[i];
		i++;
	}
	validateEntityName(notationName);
	i = skipWhitespace(xmlData, i);
	const identifierType = xmlData.substring(i, i + 6).toUpperCase();
	if (identifierType !== "SYSTEM" && identifierType !== "PUBLIC") throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
	i += identifierType.length;
	i = skipWhitespace(xmlData, i);
	let publicIdentifier = null;
	let systemIdentifier = null;
	if (identifierType === "PUBLIC") {
		[i, publicIdentifier] = readIdentifierVal(xmlData, i, "publicIdentifier");
		i = skipWhitespace(xmlData, i);
		if (xmlData[i] === "\"" || xmlData[i] === "'") [i, systemIdentifier] = readIdentifierVal(xmlData, i, "systemIdentifier");
	} else if (identifierType === "SYSTEM") {
		[i, systemIdentifier] = readIdentifierVal(xmlData, i, "systemIdentifier");
		if (!systemIdentifier) throw new Error("Missing mandatory system identifier for SYSTEM notation");
	}
	return {
		notationName,
		publicIdentifier,
		systemIdentifier,
		index: --i
	};
}
function readIdentifierVal(xmlData, i, type) {
	let identifierVal = "";
	const startChar = xmlData[i];
	if (startChar !== "\"" && startChar !== "'") throw new Error(`Expected quoted string, found "${startChar}"`);
	i++;
	while (i < xmlData.length && xmlData[i] !== startChar) {
		identifierVal += xmlData[i];
		i++;
	}
	if (xmlData[i] !== startChar) throw new Error(`Unterminated ${type} value`);
	i++;
	return [i, identifierVal];
}
function readElementExp(xmlData, i) {
	i = skipWhitespace(xmlData, i);
	let elementName = "";
	while (i < xmlData.length && !/\s/.test(xmlData[i])) {
		elementName += xmlData[i];
		i++;
	}
	if (!validateEntityName(elementName)) throw new Error(`Invalid element name: "${elementName}"`);
	i = skipWhitespace(xmlData, i);
	let contentModel = "";
	if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
	else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
	else if (xmlData[i] === "(") {
		i++;
		while (i < xmlData.length && xmlData[i] !== ")") {
			contentModel += xmlData[i];
			i++;
		}
		if (xmlData[i] !== ")") throw new Error("Unterminated content model");
	} else throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
	return {
		elementName,
		contentModel: contentModel.trim(),
		index: i
	};
}
function hasSeq(data, seq, i) {
	for (let j = 0; j < seq.length; j++) if (seq[j] !== data[i + j + 1]) return false;
	return true;
}
function validateEntityName(name) {
	if (isName(name)) return name;
	else throw new Error(`Invalid entity name ${name}`);
}
//#endregion
//#region node_modules/strnum/strnum.js
var hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
var binRegex = /^0b[01]+$/;
var octRegex = /^0o[0-7]+$/;
var numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
var consider = {
	hex: true,
	binary: false,
	octal: false,
	leadingZeros: true,
	decimalPoint: ".",
	eNotation: true,
	infinity: "original",
	unicode: false
};
function toNumber(str, options = {}) {
	options = Object.assign({}, consider, options);
	if (!str || typeof str !== "string") return str;
	let trimmedStr = str.trim();
	if (trimmedStr.length === 0) return str;
	else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
	else if (trimmedStr === "0") return 0;
	if (options.unicode) {
		trimmedStr = anynum(trimmedStr);
		if (trimmedStr === "0") return 0;
	}
	if (options.hex && hexRegex.test(trimmedStr)) return parse_int(trimmedStr, 16);
	else if (options.binary && binRegex.test(trimmedStr)) return parse_int(trimmedStr, 2);
	else if (options.octal && octRegex.test(trimmedStr)) return parse_int(trimmedStr, 8);
	else if (!isFinite(trimmedStr)) return handleInfinity(str, Number(trimmedStr), options);
	else if (trimmedStr.includes("e") || trimmedStr.includes("E")) return resolveEnotation(str, trimmedStr, options);
	else {
		const match = numRegex.exec(trimmedStr);
		if (match) {
			const sign = match[1] || "";
			const leadingZeros = match[2];
			let numTrimmedByZeros = trimZeros(match[3]);
			const decimalAdjacentToLeadingZeros = sign ? str[leadingZeros.length + 1] === "." : str[leadingZeros.length] === ".";
			if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) return str;
			else {
				const num = Number(trimmedStr);
				const parsedStr = String(num);
				if (num === 0) return num;
				if (parsedStr.search(/[eE]/) !== -1) {
					if (options.eNotation) return num;
					else return str;
				} else if (trimmedStr.indexOf(".") !== -1) {
					if (parsedStr === "0") return num;
					else if (parsedStr === numTrimmedByZeros) return num;
					else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
					else return str;
				}
				let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
				if (leadingZeros) return n === parsedStr || sign + n === parsedStr ? num : str;
				else return n === parsedStr || n === sign + parsedStr ? num : str;
			}
		} else return str;
	}
}
var eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
	if (!options.eNotation) return str;
	const notation = trimmedStr.match(eNotationRegx);
	if (notation) {
		let sign = notation[1] || "";
		const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
		const leadingZeros = notation[2];
		const eAdjacentToLeadingZeros = sign ? str[leadingZeros.length + 1] === eChar : str[leadingZeros.length] === eChar;
		if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
		else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) return Number(trimmedStr);
		else if (leadingZeros.length > 0) {
			if (options.leadingZeros && !eAdjacentToLeadingZeros) {
				trimmedStr = (notation[1] || "") + notation[3];
				return Number(trimmedStr);
			} else return str;
		} else return Number(trimmedStr);
	} else return str;
}
/**
* 
* @param {string} numStr without leading zeros
* @returns 
*/
function trimZeros(numStr) {
	if (numStr && numStr.indexOf(".") !== -1) {
		let end = numStr.length;
		while (end > 0 && numStr.charCodeAt(end - 1) === 48) end--;
		numStr = numStr.slice(0, end);
		if (numStr === ".") numStr = "0";
		else if (numStr[0] === ".") numStr = "0" + numStr;
		else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
		return numStr;
	}
	return numStr;
}
function parse_int(numStr, base) {
	const str = numStr.trim();
	if (base === 2 || base === 8) numStr = str.substring(2);
	if (parseInt) return parseInt(numStr, base);
	else if (Number.parseInt) return Number.parseInt(numStr, base);
	else if (window && window.parseInt) return window.parseInt(numStr, base);
	else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
/**
* Handle infinite values based on user option
* @param {string} str - original input string
* @param {number} num - parsed number (Infinity or -Infinity)
* @param {object} options - user options
* @returns {string|number|null} based on infinity option
*/
function handleInfinity(str, num, options) {
	const isPositive = num === Infinity;
	switch (options.infinity.toLowerCase()) {
		case "null": return null;
		case "infinity": return num;
		case "string": return isPositive ? "Infinity" : "-Infinity";
		default: return str;
	}
}
//#endregion
//#region node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
	if (typeof ignoreAttributes === "function") return ignoreAttributes;
	if (Array.isArray(ignoreAttributes)) return (attrName) => {
		for (const pattern of ignoreAttributes) {
			if (typeof pattern === "string" && attrName === pattern) return true;
			if (pattern instanceof RegExp && pattern.test(attrName)) return true;
		}
	};
	return () => false;
}
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
var OrderedObjParser = class {
	constructor(options) {
		this.options = options;
		this.currentNode = null;
		this.tagsNodeStack = [];
		this.docTypeEntities = {};
		this.lastEntities = {
			"apos": {
				regex: /&(apos|#39|#x27);/g,
				val: "'"
			},
			"gt": {
				regex: /&(gt|#62|#x3E);/g,
				val: ">"
			},
			"lt": {
				regex: /&(lt|#60|#x3C);/g,
				val: "<"
			},
			"quot": {
				regex: /&(quot|#34|#x22);/g,
				val: "\""
			}
		};
		this.ampEntity = {
			regex: /&(amp|#38|#x26);/g,
			val: "&"
		};
		this.htmlEntities = {
			"space": {
				regex: /&(nbsp|#160);/g,
				val: " "
			},
			"cent": {
				regex: /&(cent|#162);/g,
				val: "¢"
			},
			"pound": {
				regex: /&(pound|#163);/g,
				val: "£"
			},
			"yen": {
				regex: /&(yen|#165);/g,
				val: "¥"
			},
			"euro": {
				regex: /&(euro|#8364);/g,
				val: "€"
			},
			"copyright": {
				regex: /&(copy|#169);/g,
				val: "©"
			},
			"reg": {
				regex: /&(reg|#174);/g,
				val: "®"
			},
			"inr": {
				regex: /&(inr|#8377);/g,
				val: "₹"
			},
			"num_dec": {
				regex: /&#([0-9]{1,7});/g,
				val: (_, str) => String.fromCodePoint(Number.parseInt(str, 10))
			},
			"num_hex": {
				regex: /&#x([0-9a-fA-F]{1,6});/g,
				val: (_, str) => String.fromCodePoint(Number.parseInt(str, 16))
			}
		};
		this.addExternalEntities = addExternalEntities;
		this.parseXml = parseXml;
		this.parseTextData = parseTextData;
		this.resolveNameSpace = resolveNameSpace;
		this.buildAttributesMap = buildAttributesMap;
		this.isItStopNode = isItStopNode;
		this.replaceEntitiesValue = replaceEntitiesValue;
		this.readStopNodeData = readStopNodeData;
		this.saveTextToParentTag = saveTextToParentTag;
		this.addChild = addChild;
		this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
	}
};
function addExternalEntities(externalEntities) {
	const entKeys = Object.keys(externalEntities);
	for (let i = 0; i < entKeys.length; i++) {
		const ent = entKeys[i];
		this.lastEntities[ent] = {
			regex: new RegExp("&" + ent + ";", "g"),
			val: externalEntities[ent]
		};
	}
}
/**
* @param {string} val
* @param {string} tagName
* @param {string} jPath
* @param {boolean} dontTrim
* @param {boolean} hasAttributes
* @param {boolean} isLeafNode
* @param {boolean} escapeEntities
*/
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
	if (val !== void 0) {
		if (this.options.trimValues && !dontTrim) val = val.trim();
		if (val.length > 0) {
			if (!escapeEntities) val = this.replaceEntitiesValue(val);
			const newval = this.options.tagValueProcessor(tagName, val, jPath, hasAttributes, isLeafNode);
			if (newval === null || newval === void 0) return val;
			else if (typeof newval !== typeof val || newval !== val) return newval;
			else if (this.options.trimValues) return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
			else if (val.trim() === val) return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
			else return val;
		}
	}
}
function resolveNameSpace(tagname) {
	if (this.options.removeNSPrefix) {
		const tags = tagname.split(":");
		const prefix = tagname.charAt(0) === "/" ? "/" : "";
		if (tags[0] === "xmlns") return "";
		if (tags.length === 2) tagname = prefix + tags[1];
	}
	return tagname;
}
var attrsRegx = /* @__PURE__ */ new RegExp("([^\\s=]+)\\s*(=\\s*(['\"])([\\s\\S]*?)\\3)?", "gm");
function buildAttributesMap(attrStr, jPath, tagName) {
	if (this.options.ignoreAttributes !== true && typeof attrStr === "string") {
		const matches = getAllMatches(attrStr, attrsRegx);
		const len = matches.length;
		const attrs = {};
		for (let i = 0; i < len; i++) {
			const attrName = this.resolveNameSpace(matches[i][1]);
			if (this.ignoreAttributesFn(attrName, jPath)) continue;
			let oldVal = matches[i][4];
			let aName = this.options.attributeNamePrefix + attrName;
			if (attrName.length) {
				if (this.options.transformAttributeName) aName = this.options.transformAttributeName(aName);
				if (aName === "__proto__") aName = "#__proto__";
				if (oldVal !== void 0) {
					if (this.options.trimValues) oldVal = oldVal.trim();
					oldVal = this.replaceEntitiesValue(oldVal);
					const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPath);
					if (newVal === null || newVal === void 0) attrs[aName] = oldVal;
					else if (typeof newVal !== typeof oldVal || newVal !== oldVal) attrs[aName] = newVal;
					else attrs[aName] = parseValue(oldVal, this.options.parseAttributeValue, this.options.numberParseOptions);
				} else if (this.options.allowBooleanAttributes) attrs[aName] = true;
			}
		}
		if (!Object.keys(attrs).length) return;
		if (this.options.attributesGroupName) {
			const attrCollection = {};
			attrCollection[this.options.attributesGroupName] = attrs;
			return attrCollection;
		}
		return attrs;
	}
}
var parseXml = function(xmlData) {
	xmlData = xmlData.replace(/\r\n?/g, "\n");
	const xmlObj = new XmlNode("!xml");
	let currentNode = xmlObj;
	let textData = "";
	let jPath = "";
	for (let i = 0; i < xmlData.length; i++) if (xmlData[i] === "<") {
		if (xmlData[i + 1] === "/") {
			const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
			let tagName = xmlData.substring(i + 2, closeIndex).trim();
			if (this.options.removeNSPrefix) {
				const colonIndex = tagName.indexOf(":");
				if (colonIndex !== -1) tagName = tagName.substr(colonIndex + 1);
			}
			if (this.options.transformTagName) tagName = this.options.transformTagName(tagName);
			if (currentNode) textData = this.saveTextToParentTag(textData, currentNode, jPath);
			const lastTagName = jPath.substring(jPath.lastIndexOf(".") + 1);
			if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
			let propIndex = 0;
			if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
				propIndex = jPath.lastIndexOf(".", jPath.lastIndexOf(".") - 1);
				this.tagsNodeStack.pop();
			} else propIndex = jPath.lastIndexOf(".");
			jPath = jPath.substring(0, propIndex);
			currentNode = this.tagsNodeStack.pop();
			textData = "";
			i = closeIndex;
		} else if (xmlData[i + 1] === "?") {
			let tagData = readTagExp(xmlData, i, false, "?>");
			if (!tagData) throw new Error("Pi Tag is not closed.");
			textData = this.saveTextToParentTag(textData, currentNode, jPath);
			if (this.options.ignoreDeclaration && tagData.tagName === "?xml" || this.options.ignorePiTags) {} else {
				const childNode = new XmlNode(tagData.tagName);
				childNode.add(this.options.textNodeName, "");
				if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) childNode[":@"] = this.buildAttributesMap(tagData.tagExp, jPath, tagData.tagName);
				this.addChild(currentNode, childNode, jPath, i);
			}
			i = tagData.closeIndex + 1;
		} else if (xmlData.substr(i + 1, 3) === "!--") {
			const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
			if (this.options.commentPropName) {
				const comment = xmlData.substring(i + 4, endIndex - 2);
				textData = this.saveTextToParentTag(textData, currentNode, jPath);
				currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
			}
			i = endIndex;
		} else if (xmlData.substr(i + 1, 2) === "!D") {
			const result = readDocType(xmlData, i);
			this.docTypeEntities = result.entities;
			i = result.i;
		} else if (xmlData.substr(i + 1, 2) === "![") {
			const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
			const tagExp = xmlData.substring(i + 9, closeIndex);
			textData = this.saveTextToParentTag(textData, currentNode, jPath);
			let val = this.parseTextData(tagExp, currentNode.tagname, jPath, true, false, true, true);
			if (val == void 0) val = "";
			if (this.options.cdataPropName) currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
			else currentNode.add(this.options.textNodeName, val);
			i = closeIndex + 2;
		} else {
			let result = readTagExp(xmlData, i, this.options.removeNSPrefix);
			let tagName = result.tagName;
			const rawTagName = result.rawTagName;
			let tagExp = result.tagExp;
			let attrExpPresent = result.attrExpPresent;
			let closeIndex = result.closeIndex;
			if (this.options.transformTagName) tagName = this.options.transformTagName(tagName);
			if (currentNode && textData) {
				if (currentNode.tagname !== "!xml") textData = this.saveTextToParentTag(textData, currentNode, jPath, false);
			}
			const lastTag = currentNode;
			if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
				currentNode = this.tagsNodeStack.pop();
				jPath = jPath.substring(0, jPath.lastIndexOf("."));
			}
			if (tagName !== xmlObj.tagname) jPath += jPath ? "." + tagName : tagName;
			const startIndex = i;
			if (this.isItStopNode(this.options.stopNodes, jPath, tagName)) {
				let tagContent = "";
				if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
					if (tagName[tagName.length - 1] === "/") {
						tagName = tagName.substr(0, tagName.length - 1);
						jPath = jPath.substr(0, jPath.length - 1);
						tagExp = tagName;
					} else tagExp = tagExp.substr(0, tagExp.length - 1);
					i = result.closeIndex;
				} else if (this.options.unpairedTags.indexOf(tagName) !== -1) i = result.closeIndex;
				else {
					const result = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
					if (!result) throw new Error(`Unexpected end of ${rawTagName}`);
					i = result.i;
					tagContent = result.tagContent;
				}
				const childNode = new XmlNode(tagName);
				if (tagName !== tagExp && attrExpPresent) childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
				if (tagContent) tagContent = this.parseTextData(tagContent, tagName, jPath, true, attrExpPresent, true, true);
				jPath = jPath.substr(0, jPath.lastIndexOf("."));
				childNode.add(this.options.textNodeName, tagContent);
				this.addChild(currentNode, childNode, jPath, startIndex);
			} else {
				if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
					if (tagName[tagName.length - 1] === "/") {
						tagName = tagName.substr(0, tagName.length - 1);
						jPath = jPath.substr(0, jPath.length - 1);
						tagExp = tagName;
					} else tagExp = tagExp.substr(0, tagExp.length - 1);
					if (this.options.transformTagName) tagName = this.options.transformTagName(tagName);
					const childNode = new XmlNode(tagName);
					if (tagName !== tagExp && attrExpPresent) childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
					this.addChild(currentNode, childNode, jPath, startIndex);
					jPath = jPath.substr(0, jPath.lastIndexOf("."));
				} else {
					const childNode = new XmlNode(tagName);
					this.tagsNodeStack.push(currentNode);
					if (tagName !== tagExp && attrExpPresent) childNode[":@"] = this.buildAttributesMap(tagExp, jPath, tagName);
					this.addChild(currentNode, childNode, jPath, startIndex);
					currentNode = childNode;
				}
				textData = "";
				i = closeIndex;
			}
		}
	} else textData += xmlData[i];
	return xmlObj.child;
};
function addChild(currentNode, childNode, jPath, startIndex) {
	if (!this.options.captureMetaData) startIndex = void 0;
	const result = this.options.updateTag(childNode.tagname, jPath, childNode[":@"]);
	if (result === false) {} else if (typeof result === "string") {
		childNode.tagname = result;
		currentNode.addChild(childNode, startIndex);
	} else currentNode.addChild(childNode, startIndex);
}
var replaceEntitiesValue = function(val) {
	if (this.options.processEntities) {
		for (let entityName in this.docTypeEntities) {
			const entity = this.docTypeEntities[entityName];
			val = val.replace(entity.regx, entity.val);
		}
		for (let entityName in this.lastEntities) {
			const entity = this.lastEntities[entityName];
			val = val.replace(entity.regex, entity.val);
		}
		if (this.options.htmlEntities) for (let entityName in this.htmlEntities) {
			const entity = this.htmlEntities[entityName];
			val = val.replace(entity.regex, entity.val);
		}
		val = val.replace(this.ampEntity.regex, this.ampEntity.val);
	}
	return val;
};
function saveTextToParentTag(textData, currentNode, jPath, isLeafNode) {
	if (textData) {
		if (isLeafNode === void 0) isLeafNode = currentNode.child.length === 0;
		textData = this.parseTextData(textData, currentNode.tagname, jPath, false, currentNode[":@"] ? Object.keys(currentNode[":@"]).length !== 0 : false, isLeafNode);
		if (textData !== void 0 && textData !== "") currentNode.add(this.options.textNodeName, textData);
		textData = "";
	}
	return textData;
}
/**
* 
* @param {string[]} stopNodes 
* @param {string} jPath
* @param {string} currentTagName 
*/
function isItStopNode(stopNodes, jPath, currentTagName) {
	const allNodesExp = "*." + currentTagName;
	for (const stopNodePath in stopNodes) {
		const stopNodeExp = stopNodes[stopNodePath];
		if (allNodesExp === stopNodeExp || jPath === stopNodeExp) return true;
	}
	return false;
}
/**
* Returns the tag Expression and where it is ending handling single-double quotes situation
* @param {string} xmlData 
* @param {number} i starting index
* @returns 
*/
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
	let attrBoundary;
	let tagExp = "";
	for (let index = i; index < xmlData.length; index++) {
		let ch = xmlData[index];
		if (attrBoundary) {
			if (ch === attrBoundary) attrBoundary = "";
		} else if (ch === "\"" || ch === "'") attrBoundary = ch;
		else if (ch === closingChar[0]) {
			if (closingChar[1]) {
				if (xmlData[index + 1] === closingChar[1]) return {
					data: tagExp,
					index
				};
			} else return {
				data: tagExp,
				index
			};
		} else if (ch === "	") ch = " ";
		tagExp += ch;
	}
}
function findClosingIndex(xmlData, str, i, errMsg) {
	const closingIndex = xmlData.indexOf(str, i);
	if (closingIndex === -1) throw new Error(errMsg);
	else return closingIndex + str.length - 1;
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
	const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
	if (!result) return;
	let tagExp = result.data;
	const closeIndex = result.index;
	const separatorIndex = tagExp.search(/\s/);
	let tagName = tagExp;
	let attrExpPresent = true;
	if (separatorIndex !== -1) {
		tagName = tagExp.substring(0, separatorIndex);
		tagExp = tagExp.substring(separatorIndex + 1).trimStart();
	}
	const rawTagName = tagName;
	if (removeNSPrefix) {
		const colonIndex = tagName.indexOf(":");
		if (colonIndex !== -1) {
			tagName = tagName.substr(colonIndex + 1);
			attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
		}
	}
	return {
		tagName,
		tagExp,
		closeIndex,
		attrExpPresent,
		rawTagName
	};
}
/**
* find paired tag for a stop node
* @param {string} xmlData 
* @param {string} tagName 
* @param {number} i 
*/
function readStopNodeData(xmlData, tagName, i) {
	const startIndex = i;
	let openTagCount = 1;
	for (; i < xmlData.length; i++) if (xmlData[i] === "<") {
		if (xmlData[i + 1] === "/") {
			const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
			if (xmlData.substring(i + 2, closeIndex).trim() === tagName) {
				openTagCount--;
				if (openTagCount === 0) return {
					tagContent: xmlData.substring(startIndex, i),
					i: closeIndex
				};
			}
			i = closeIndex;
		} else if (xmlData[i + 1] === "?") i = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
		else if (xmlData.substr(i + 1, 3) === "!--") i = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
		else if (xmlData.substr(i + 1, 2) === "![") i = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
		else {
			const tagData = readTagExp(xmlData, i, ">");
			if (tagData) {
				if ((tagData && tagData.tagName) === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") openTagCount++;
				i = tagData.closeIndex;
			}
		}
	}
}
function parseValue(val, shouldParse, options) {
	if (shouldParse && typeof val === "string") {
		const newval = val.trim();
		if (newval === "true") return true;
		else if (newval === "false") return false;
		else return toNumber(val, options);
	} else if (isExist(val)) return val;
	else return "";
}
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/node2json.js
var METADATA_SYMBOL = XmlNode.getMetaDataSymbol();
/**
* 
* @param {array} node 
* @param {any} options 
* @returns 
*/
function prettify(node, options) {
	return compress(node, options);
}
/**
* 
* @param {array} arr 
* @param {object} options 
* @param {string} jPath 
* @returns object
*/
function compress(arr, options, jPath) {
	let text;
	const compressedObj = {};
	for (let i = 0; i < arr.length; i++) {
		const tagObj = arr[i];
		const property = propName(tagObj);
		let newJpath = "";
		if (jPath === void 0) newJpath = property;
		else newJpath = jPath + "." + property;
		if (property === options.textNodeName) {
			if (text === void 0) text = tagObj[property];
			else text += "" + tagObj[property];
		} else if (property === void 0) continue;
		else if (tagObj[property]) {
			let val = compress(tagObj[property], options, newJpath);
			const isLeaf = isLeafTag(val, options);
			if (tagObj[METADATA_SYMBOL] !== void 0) val[METADATA_SYMBOL] = tagObj[METADATA_SYMBOL];
			if (tagObj[":@"]) assignAttributes(val, tagObj[":@"], newJpath, options);
			else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) val = val[options.textNodeName];
			else if (Object.keys(val).length === 0) {
				if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
				else val = "";
			}
			if (compressedObj[property] !== void 0 && compressedObj.hasOwnProperty(property)) {
				if (!Array.isArray(compressedObj[property])) compressedObj[property] = [compressedObj[property]];
				compressedObj[property].push(val);
			} else if (options.isArray(property, newJpath, isLeaf)) compressedObj[property] = [val];
			else compressedObj[property] = val;
		}
	}
	if (typeof text === "string") {
		if (text.length > 0) compressedObj[options.textNodeName] = text;
	} else if (text !== void 0) compressedObj[options.textNodeName] = text;
	return compressedObj;
}
function propName(obj) {
	const keys = Object.keys(obj);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i];
		if (key !== ":@") return key;
	}
}
function assignAttributes(obj, attrMap, jpath, options) {
	if (attrMap) {
		const keys = Object.keys(attrMap);
		const len = keys.length;
		for (let i = 0; i < len; i++) {
			const atrrName = keys[i];
			if (options.isArray(atrrName, jpath + "." + atrrName, true, true)) obj[atrrName] = [attrMap[atrrName]];
			else obj[atrrName] = attrMap[atrrName];
		}
	}
}
function isLeafTag(obj, options) {
	const { textNodeName } = options;
	const propCount = Object.keys(obj).length;
	if (propCount === 0) return true;
	if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) return true;
	return false;
}
//#endregion
//#region node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var XMLParser = class {
	constructor(options) {
		this.externalEntities = {};
		this.options = buildOptions(options);
	}
	/**
	* Parse XML dats to JS object 
	* @param {string|Buffer} xmlData 
	* @param {boolean|Object} validationOption 
	*/
	parse(xmlData, validationOption) {
		if (typeof xmlData === "string") {} else if (xmlData.toString) xmlData = xmlData.toString();
		else throw new Error("XML data is accepted in String or Bytes[] form.");
		if (validationOption) {
			if (validationOption === true) validationOption = {};
			const result = validate(xmlData, validationOption);
			if (result !== true) throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
		}
		const orderedObjParser = new OrderedObjParser(this.options);
		orderedObjParser.addExternalEntities(this.externalEntities);
		const orderedResult = orderedObjParser.parseXml(xmlData);
		if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
		else return prettify(orderedResult, this.options);
	}
	/**
	* Add Entity which is not by default supported by this library
	* @param {string} key 
	* @param {string} value 
	*/
	addEntity(key, value) {
		if (value.indexOf("&") !== -1) throw new Error("Entity value can't have '&'");
		else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
		else if (value === "&") throw new Error("An entity with value '&' is not permitted");
		else this.externalEntities[key] = value;
	}
	/**
	* Returns a Symbol that can be used to access the metadata
	* property on a node.
	* 
	* If Symbol is not available in the environment, an ordinary property is used
	* and the name of the property is here returned.
	* 
	* The XMLMetaData property is only present when `captureMetaData`
	* is true in the options.
	*/
	static getMetaDataSymbol() {
		return XmlNode.getMetaDataSymbol();
	}
};
//#endregion
export { XMLParser as t };
