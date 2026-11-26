/* 又一个放置RPG — 简体中文覆盖层 (Route O)
 * 与内置语言包 locales/chinese.js 互补：语言包覆盖对话/种族/属性等走 getText() 的文本，
 * 覆盖层负责源码里硬编码的展示文本（物品、地点、技能、提示框、UI 文案等）。
 * 设计要点：
 *  - 只替换「整段文本节点完全等于词条」的节点，不碰代码标识符；
 *  - 不含拉丁字母的文本直接跳过（幂等保护）；
 *  - MutationObserver 回调内同步翻译，避免闪一帧英文；
 *  - .material-icons 等图标连字节点一律不碰。
 */
(function () {
  "use strict";

  var STORAGE_KEY = "yairpg_language";
  var DICT = window.YAIRPG_ZH || null;
  if (!DICT) { console.warn("[zh] 字典未加载"); return; }

  function current_language() {
    var v = null;
    try { v = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    return v === "english" ? "english" : "chinese";
  }
  if (current_language() !== "chinese") return;

  document.documentElement.lang = "zh-CN";

  // ---- 词条前处理：源码里同一句可能带不同引号/省略号/大小写 ----
  function normalize(s) {
    return s
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\.\.\./g, "…")
      .replace(/[\s\u00a0]+/g, " ")
      .trim();
  }

  var MAP = Object.create(null);
  var NORM_MAP = Object.create(null);
  var LOWER_MAP = Object.create(null);
  for (var k in DICT) {
    if (!Object.prototype.hasOwnProperty.call(DICT, k)) continue;
    var v = DICT[k];
    if (!v || v === "!SKIP") continue;
    MAP[k] = v;
    var nk = normalize(k);
    if (!(nk in NORM_MAP)) NORM_MAP[nk] = v;
    var lk = k.toLowerCase();
    if (!(lk in LOWER_MAP)) LOWER_MAP[lk] = v;
  }

  // ---- 动态文本模板（数值/时间/数量参与拼接）----
  var TEMPLATES = [];
  var TPL_SEEN = Object.create(null);
  function tpl(re, fn) {
    var key = re.source + "|" + re.flags;
    if (TPL_SEEN[key]) return;   // 同名规则只登记一次，避免重复注册导致模板表无限增长
    TPL_SEEN[key] = 1;
    TEMPLATES.push([re, fn]);
  }

  // 技能里程碑与格挡描述
  tpl(/^Thanks to (.+?) reaching new milestone, (.+?) gained:\s*$/, function (t) {
    var m = /^Thanks to (.+?) reaching new milestone, (.+?) gained:\s*$/.exec(t);
    return (tr_label(m[1]) || m[1]) + " 达到新里程碑，" + m[2] + " 获得了：";
  });
  tpl(/^Increases block chance by flat ([\d.]+)%\. Increases blocked damage by ([\d.]+)%, and blocks ([\d.]+)% of attack damage before other calculations\.$/, function (t) {
    var m = /^Increases block chance by flat ([\d.]+)%\. Increases blocked damage by ([\d.]+)%, and blocks ([\d.]+)% of attack damage before other calculations\.$/.exec(t);
    return "格挡率固定提高 " + m[1] + "%。受到的格挡伤害提高 " + m[2] + "%，并在其它计算之前先抵挡 " + m[3] + "% 的攻击伤害。";
  });

  // 部件缺失提示："no [handle]"
  // 生成的部件/装备名："<材料> <部件类型>"（如 Iron shield handle）
  var COMP_SUFFIX = [
    ["chestplate armor", "胸甲"], ["helmet armor", "头盔"], ["glove armor", "手甲"],
    ["shoe armor", "鞋甲"], ["armored pants", "腿甲"],
    ["shield base", "盾坯"], ["shield handle", "盾柄"], ["shield", "盾"],
    ["short handle", "短握柄"], ["medium handle", "中握柄"], ["long handle", "长握柄"],
    ["short blade", "短刃"], ["long blade", "长刃"], ["axe head", "斧头"], ["hammer head", "锤头"],
    ["vest", "背心"], ["hat", "帽子"], ["pants", "裤子"], ["gloves", "手套"], ["shoes", "鞋子"], ["greaves", "胫甲"]
  ];
  // 界面上露出的裸属性键："attack_power"、"crit_multiplier"
  tpl(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/, function (t) {
    var hit = tr_label(t);
    if (!hit) hit = tr_label(t.replace(/_/g, " "));
    if (!hit) {
      var spaced = t.replace(/_/g, " ");
      hit = tr_label(spaced.charAt(0).toUpperCase() + spaced.slice(1));
    }
    return hit || null;
  });

  // 词条标签行："[living] [beast] [wolf rat] [small] "
  tpl(/^(?:\[[^\]]+\]\s*)+$/, function (t) {
    var re = /\[([^\]]+)\]/g;
    var mm, parts = [], resolved = 0;
    while ((mm = re.exec(t))) {
      var inner = mm[1].trim();
      var hit = /^\?{2,}$/.test(inner) ? "？？？" : tr_label(inner);
      if (!hit) return null; // 有未识别内容就放弃，交给更具体的规则
      parts.push("[" + hit + "]");
      resolved++;
    }
    return resolved ? parts.join(" ") : null;
  });

  var comp_suffix_re = new RegExp("^(.+?) (" + COMP_SUFFIX.map(function (s) { return s[0]; }).join("|") + ")$");
  tpl(comp_suffix_re, function (t) {
    var m = comp_suffix_re.exec(t);
    if (!m) return null;
    var suf = null;
    for (var i = 0; i < COMP_SUFFIX.length; i++) if (COMP_SUFFIX[i][0] === m[2]) suf = COMP_SUFFIX[i][1];
    if (!suf) return null;
    var mat = tr_label(m[1]);
    if (!mat) {
      var pre = /^(Cheap|Simple|Low quality) (.+)$/i.exec(m[1]);
      if (pre) {
        var base = tr_label(pre[2]);
        var prefix_map = { cheap: "廉价", simple: "简易", "low quality": "低劣" };
        if (base) mat = prefix_map[pre[1].toLowerCase()] + base;
      }
    }
    if (!mat) mat = translate(m[1]);
    // 「木质盾」按游戏既有译法缩成「木盾」
    if (mat) mat = mat.replace(/木质$/, "木");
    return mat ? mat + suf : null;
  });

  tpl(/^no \[(.+)\]$/, function (t) {
    var inner = /^no \[(.+)\]$/.exec(t)[1];
    return "缺少［" + (tr_label(inner) || inner) + "］";
  });

  // 部件缺失提示："no [handle]"  // 整句短语替换：用于「多段字符串拼接成一句话」的描述（地点描述、商店描述等）
  var PHRASES = [
    [/Medium-sized village, built at the foot of the mountains, with rocks preventing any expansions towards north\. It's surrounded by many fields, /g, "一座中等规模的村庄，坐落在山脚，北面被岩石挡住，无法再向外扩展。四周是大片农田，"],
    [/many of them infested by huge rats\./g, "其中不少已被巨鼠侵占。"],
    [/most of them infested by huge rats\./g, "其中大半已被巨鼠侵占。"],
    [/a few of them infested by huge rats, which, while an annoyance, don't seem possible to fully eradicate\./g, "其中少数已被巨鼠侵占，虽然恼人，但似乎没法彻底清除。"],
    [/There is a relatively calm, somewhat small river south of it with /g, "村南有一条相对平静的小河，河上"],
    [/a sturdy, impressive bridge over it/g, "架着一座结实气派的大桥"],
    [/no bridges over it/g, "没有任何桥"],
    [/and with some old structures on the other side, clearly not used for years if not longer\./g, "对岸残留着几处老旧建筑，看样子少说也废弃了很多年。"],
    [/Many villagers seem to have nothing to do /g, "村里不少人无事可做，"],
    [/but it's less than it used to be, with some already occupied on the other side of the river\./g, "不过比从前好了一些，已经有人在对岸忙活起来了。"],
    [/and are just sitting around\./g, "只是坐在那儿发呆。"],
    [/An old but well kept store on the side of the central square, with a huge collection of antiques inside, most of them apparently not for sale as this place also/g, "中央广场边上一家老旧却打理得很好的店铺，里面收藏了大量古董，其中多数显然不出售——这地方同时"],
    [/functions as a private museum\. There are paintings, furniture, ancient weapons and armors, as well as some things you cannot even recognize\./g, "兼作私人博物馆。有画作、家具、古老的武器与盔甲，还有些你根本认不出的东西。"],
  ];

  function apply_phrases(s) {
    var out = s, changed = false;
    for (var i = 0; i < PHRASES.length; i++) {
      PHRASES[i][0].lastIndex = 0;
      if (PHRASES[i][0].test(out)) {
        PHRASES[i][0].lastIndex = 0;
        out = out.replace(PHRASES[i][0], PHRASES[i][1]);
        changed = true;
      }
    }
    return changed ? out : null;
  }

  var UNITS = { stamina: "体力", mana: "法力", hp: "生命", xp: "经验", atk: "攻击", def: "防御", spd: "速度" };

  // 括号里的品质/等级名（如 "[trash]"）
  function fix_brackets(s) {
    return s.replace(/\[([A-Za-z][A-Za-z \-']{1,20})\]/g, function (all, word) {
      var hit = MAP[word] || MAP[word.toLowerCase()] || NORM_MAP[normalize(word)];
      return hit ? "[" + hit + "]" : all;
    });
  }

  // 数值条："40/40stamina"、"0/0 mana"、"0 / 10 xp"
  tpl(/^([\d.]+)\s*\/\s*([\d.]+)\s*(stamina|mana|hp|xp)$/i, function (t) {
    var m = /^([\d.]+)\s*\/\s*([\d.]+)\s*(stamina|mana|hp|xp)$/i.exec(t);
    var u = UNITS[m[3].toLowerCase()];
    return u ? m[1] + "/" + m[2] + u : null;
  });

  // 价格原值："[originally 4"
  tpl(/^\[originally (.+)$/, function (t) {
    return "［原价" + /^\[originally (.+)$/.exec(t)[1];
  });

  // 未知物品等级："????? level: +3"
  tpl(/^(\?+) level: (.+)$/, function (t) {
    var m = /^(\?+) level: (.+)$/.exec(t);
    return m[1] + " 等级：" + m[2];
  });

  // 装备槽位："head slot" / "Your head slot"
  tpl(/^(Your )?([A-Za-z][A-Za-z \-]{1,20}) slot$/, function (t) {
    var m = /^(Your )?([A-Za-z][A-Za-z \-]{1,20}) slot$/.exec(t);
    var name = tr_label(m[2]);
    if (!name) return null;
    return (m[1] ? "你的" : "") + name + "槽位";
  });

  // 材料需求："Any animal tooth: x0/20"
  tpl(/^Any (.+?): (.+)$/, function (t) {
    var m = /^Any (.+?): (.+)$/.exec(t);
    var name = tr_label(m[1]);
    return name ? "任意" + name + "：" + m[2] : null;
  });

  // 引号包裹的标签："'Basic meal' :"
  tpl(/^'(.+)'\s*:$/, function (t) {
    var inner = /^'(.+)'\s*:$/.exec(t)[1];
    var hit = tr_label(inner);
    return hit ? "「" + hit + "」：" : null;
  });

  // 方括号单一部件名："[legs]" / "[axe head]"
  tpl(/^\[([A-Za-z][A-Za-z0-9 '\-\.]{1,60})\]$/, function (t) {
    var inner = /^\[([A-Za-z][A-Za-z0-9 '\-\.]{1,60})\]$/.exec(t)[1];
    var hit = tr_label(inner) || translate(inner);
    return hit ? "[" + hit + "]" : null;
  });

  // 部件选择提示："Select a [axe head]"
  tpl(/^Select a \[(.+)\]$/, function (t) {
    var inner = /^Select a \[(.+)\]$/.exec(t)[1];
    var hit = tr_label(inner);
    return "选择一个[" + (hit || inner) + "]";
  });

  // 物品 + 数量："Stale bread x5/2"、"Fish fillet x3"
  tpl(/^(.+) x(\d+)(\/\d+)?$/, function (t) {
    var m = /^(.+) x(\d+)(\/\d+)?$/.exec(t);
    var name = tr_label(m[1]);
    if (!name) return null;
    return name + " x" + m[2] + (m[3] || "");
  });

  // 交谈提示："Talk to the village elder"
  tpl(/^Talk to the (.+)$/, function (t) {
    var inner = /^Talk to the (.+)$/.exec(t)[1];
    var hit = tr_label(inner);
    return hit ? "与" + hit + "交谈" : null;
  });

  // 采集/行动面板："Every 10 minutes, chance to find:"、"x1 \"???\" at 100%"、"\"Woodcutting\" skill lvl 0 to 15"
  tpl(/^Every (\d+) minutes?, chance to find:$/, function (t) {
    return "每 " + /^Every (\d+)/.exec(t)[1] + " 分钟，有几率找到：";
  });
  tpl(/^x([\d.]+(?:-[\d.]+)?) "(.+?)" at ([\d.]+)%$/, function (t) {
    var m = /^x([\d.]+(?:-[\d.]+)?) "(.+?)" at ([\d.]+)%$/.exec(t);
    return "x" + m[1] + "「" + mask_name(m[2]) + "」 " + m[3] + "%";
  });

  // 采集提示："Every 1 hour 13 minutes, chance to find:"
  tpl(/^Every (.+?), chance to find:$/, function (t) {
    var time = /^Every (.+?), chance to find:$/.exec(t)[1];
    return "每 " + (translate(time) || time) + "，有几率找到：";
  });
  tpl(/^"(.+?)" skill lvl (\d+) to (\d+)$/, function (t) {
    var m = /^"(.+?)" skill lvl (\d+) to (\d+)$/.exec(t);
    return "「" + mask_name(m[1]) + "」技能等级 " + m[2] + " 至 " + m[3];
  });
  tpl(/^Leave the village towards \[(.+?)\] (.+)$/, function (t) {
    var m = /^Leave the village towards \[(.+?)\] (.+)$/.exec(t);
    var dur = m[2].replace(/^(\d+)h(\d+)m$/, "$1小时$2分").replace(/^(\d+)m$/, "$1分");
    return "离开村庄，前往[" + (tr_label(m[1]) || m[1]) + "] " + dur;
  });

  // 解锁类："Unlocked location "X""、"Unlocked activity "X" in location "Y""
  // 制作日志与品质括号
  tpl(/^Created (.+?) \[(\d+) out of (\d+)\]$/, function (t) {
    var m = /^Created (.+?) \[(\d+) out of (\d+)\]$/.exec(t);
    return "制作了「" + (tr_label(m[1]) || m[1]) + "」［" + m[2] + " / " + m[3] + "］";
  });
  // "Created X [112% quality] x1 (+3 xp)"
  tpl(/^Created (.+?) \[([\d.]+)% quality\] x(\d+) \(\+(.+?) xp\)$/, function (t) {
    var m = /^Created (.+?) \[([\d.]+)% quality\] x(\d+) \(\+(.+?) xp\)$/.exec(t);
    var nm = tr_label(m[1]) || translate(m[1]) || m[1];
    return "制作了「" + nm + "」［品质 " + m[2] + "%］ x" + m[3] + "（+" + m[4] + " 经验）";
  });
  tpl(/^Created (.+)$/, function (t) {
    var inner = /^Created (.+)$/.exec(t)[1];
    return "制作了「" + (tr_label(inner) || translate(inner) || inner) + "」";
  });
  // 数量括号："Processed rough wood [0 out of 3]"
  tpl(/^(.+?) \[(\d+) out of (\d+)\]$/, function (t) {
    var m = /^(.+?) \[(\d+) out of (\d+)\]$/.exec(t);
    return (tr_label(m[1]) || translate(m[1]) || m[1]) + "［" + m[2] + " / " + m[3] + "］";
  });
  tpl(/^Failed to create (.+)$/, function (t) {
    var inner = /^Failed to create (.+)$/.exec(t)[1];
    var name = tr_label(inner) || translate(inner) || inner;
    return "制作失败：「" + name + "」";
  });
  tpl(/^\[base: x?([\d.]+)\]$/, function (t) { return "［基础 " + /^\[base: x?([\d.]+)\]$/.exec(t)[1] + "］"; });
  tpl(/^(.+?) \((x?[\d.]+) out of (x?[\d.]+)\)$/, function (t) {
    var m = /^(.+?) \((x?[\d.]+) out of (x?[\d.]+)\)$/.exec(t);
    return (tr_label(m[1]) || m[1]) + "（" + m[2] + " / " + m[3] + "）";
  });

  // ---- 战斗日志 ----
  function nm_sep(n) {
    var nm = tr_label(n) || n;
    return { name: nm, sep: /[A-Za-z]$/.test(nm) ? " " : "" };
  }
  tpl(/^(.+?) blocked an attack$/, function (t) {
    var r = nm_sep(/^(.+?) blocked an attack$/.exec(t)[1]);
    return r.name + r.sep + "格挡了攻击";
  });
  tpl(/^(.+?) evaded an attack$/, function (t) {
    var r = nm_sep(/^(.+?) evaded an attack$/.exec(t)[1]);
    return r.name + r.sep + "闪避了攻击";
  });
  tpl(/^(.+?) has lost consciousness$/, function (t) {
    var r = nm_sep(/^(.+?) has lost consciousness$/.exec(t)[1]);
    return r.name + r.sep + "失去了意识";
  });
  tpl(/^(.+?) has missed$/, function (t) {
    var r = nm_sep(/^(.+?) has missed$/.exec(t)[1]);
    return r.name + r.sep + "没有命中";
  });
  tpl(/^(.+?) was defeated$/, function (t) {
    var r = nm_sep(/^(.+?) was defeated$/.exec(t)[1]);
    return r.name + r.sep + "被击败了";
  });
  tpl(/^(.+?) partially blocked, was critically hit(?: x(\d+))? for ([\d.,]+) dmg$/, function (t) {
    var m = /^(.+?) partially blocked, was critically hit(?: x(\d+))? for ([\d.,]+) dmg$/.exec(t);
    var r = nm_sep(m[1]);
    return r.name + r.sep + "部分格挡，仍被暴击，受到 " + m[3] + " 点伤害" + (m[2] ? "（x" + m[2] + "）" : "");
  });
  tpl(/^(.+?) was critically hit(?: x(\d+))? for ([\d.,]+) dmg$/, function (t) {
    var m = /^(.+?) was critically hit(?: x(\d+))? for ([\d.,]+) dmg$/.exec(t);
    var r = nm_sep(m[1]);
    return r.name + r.sep + "被暴击，受到 " + m[3] + " 点伤害" + (m[2] ? "（x" + m[2] + "）" : "");
  });
  tpl(/^(.+?) partially blocked, was hit(?: x(\d+))? for ([\d.,]+) dmg$/, function (t) {
    var m = /^(.+?) partially blocked, was hit(?: x(\d+))? for ([\d.,]+) dmg$/.exec(t);
    var r = nm_sep(m[1]);
    return r.name + r.sep + "部分格挡，受到 " + m[3] + " 点伤害" + (m[2] ? "（x" + m[2] + "）" : "");
  });
  tpl(/^(.+?) was hit(?: x(\d+))? for ([\d.,]+) dmg$/, function (t) {
    var m = /^(.+?) was hit(?: x(\d+))? for ([\d.,]+) dmg$/.exec(t);
    var r = nm_sep(m[1]);
    return r.name + r.sep + "受到 " + m[3] + " 点伤害" + (m[2] ? "（x" + m[2] + "）" : "");
  });

  // 战利品："Looted "Rat tail" x1, "Rat fang" x1"（首项缺左引号，末尾可能没有右引号）
  tpl(/^(Looted|Gained|Gained in total):? "(.+)$/, function (t) {
    var m = /^(Looted|Gained|Gained in total):? "(.+)$/.exec(t);
    var prefix = { Looted: "拾取", Gained: "获得", "Gained in total": "共计获得" }[m[1]];
    var body = '"' + m[2];
    var re = /"([^"]+)" x(\d+)/g;
    var mm, parts = [];
    while ((mm = re.exec(body))) {
      var name = tr_label(mm[1]) || mm[1];
      parts.push("「" + name + "」x" + mm[2]);
    }
    if (!parts.length) return null;
    return prefix + parts.join("，");
  });

  // ---- 角色升级提示 ----
  tpl(/^(.+?) is getting stronger\. Reached level (\d+)\s*$/, function (t) {
    var m = /^(.+?) is getting stronger\. Reached level (\d+)\s*$/.exec(t);
    return m[1] + " 变得更强了。等级提升到 " + m[2];
  });
  tpl(/^(HP|Stamina|Strength|Agility|Dexterity|Intuition) increased by (\d+)$/, function (t) {
    var m = /^(HP|Stamina|Strength|Agility|Dexterity|Intuition) increased by (\d+)$/.exec(t);
    var map = { HP: "生命", Stamina: "体力", Strength: "力量", Agility: "敏捷", Dexterity: "灵巧", Intuition: "直觉" };
    return map[m[1]] + " 提升了 " + m[2];
  });
  tpl(/^Skill xp gains increased by (\d+)%$/, function (t) {
    return "技能经验获取提高了 " + /^Skill xp gains increased by (\d+)%$/.exec(t)[1] + "%";
  });

  // ---- 物品提示框 ----
  tpl(/^Attack: (.+?) - (.+)$/, function (t) {
    var m = /^Attack: (.+?) - (.+)$/.exec(t);
    return "攻击：" + m[1] + " - " + m[2];
  });
  tpl(/^Can block up to: (.+?) damage \[unaffected by skill\]$/, function (t) {
    return "最多可格挡：" + /^Can block up to: (.+?) damage/.exec(t)[1] + " 伤害［不受技能影响］";
  });
  tpl(/^Can block up to: (.+?) damage \[base: (.+?)\]$/, function (t) {
    var m = /^Can block up to: (.+?) damage \[base: (.+?)\]$/.exec(t);
    return "最多可格挡：" + m[1] + " 伤害［基础 " + m[2] + "］";
  });
  tpl(/^(.+?) skills level: ([+x]?[\d.]+)$/, function (t) {
    var m = /^(.+?) skills level: ([+x]?[\d.]+)$/.exec(t);
    var cat = tr_label(m[1] + " skills") || tr_label(m[1]) || m[1];
    return cat + " 等级：" + m[2];
  });
  tpl(/^Size-specific attack power: x([\d.]+)$/, function (t) {
    return "按体型计算的攻击力：x" + /^Size-specific attack power: x([\d.]+)$/.exec(t)[1];
  });
  tpl(/^Size: ([\d.]+)cm$/, function (t) {
    return "体型：" + /^Size: ([\d.]+)cm$/.exec(t)[1] + "cm";
  });
  tpl(/^Time to read: (.+)$/, function (t) {
    var inner = /^Time to read: (.+)$/.exec(t)[1];
    return "阅读所需时间：" + (translate(inner) || inner);
  });
  tpl(/^Reading it provided (.+?) with:$/, function (t) {
    return "读完为「" + /^Reading it provided (.+?) with:$/.exec(t)[1] + "」带来了：";
  });
  tpl(/^(.+?) xp gain: (x?[\d.]+)$/, function (t) {
    var m = /^(.+?) xp gain: (x?[\d.]+)$/.exec(t);
    var nm = tr_label(m[1]) || m[1];
    return nm + " 经验获取：" + m[2];
  });
  tpl(/^, (x[\d.]+) (.+?) xp gain$/, function (t) {
    var m = /^, (x[\d.]+) (.+?) xp gain$/.exec(t);
    var nm = tr_label(m[2]) || m[2];
    return "，" + nm + " 经验获取 " + m[1];
  });
  tpl(/^, (.+?) left$/, function (t) {
    var inner = /^, (.+?) left$/.exec(t)[1];
    return "，剩余 " + (translate(inner) || inner);
  });

  // ---- 活动 / 工作面板 ----
  tpl(/^Available from (.+?) to (.+)$/, function (t) {
    var m = /^Available from (.+?) to (.+)$/.exec(t);
    return "可参与时段：" + m[1] + " - " + m[2];
  });
  // 工作报酬（format_money 会插 <span> 把句子切开）：节点形如 "Pays 1" 与 " per every 2 hours worked"
  tpl(/^Pays ([\d.,]+)$/, function (t) {
    return "报酬 " + /^Pays ([\d.,]+)$/.exec(t)[1];
  });
  tpl(/^per every (.+?) worked$/, function (t) {
    var time = /^per every (.+?) worked$/.exec(t)[1];
    return "，每工作 " + (translate(time) || time);
  });

  // 工作报酬整句："Pays 1C 5W per every 2 hours worked"
  tpl(/^Pays (.+?) per every (.+?) worked$/, function (t) {
    var m = /^Pays (.+?) per every (.+?) worked$/.exec(t);
    var time = translate(m[2]) || m[2];
    return "每工作 " + time + "，报酬 " + m[1];
  });
  tpl(/^Pays (.+?) per every\s*$/, function (t) {
    return "报酬 " + /^Pays (.+?) per every/.exec(t)[1] + "，每";
  });
  // 只对「纯时间 + worked」的片段生效，避免把整句吞进来
  tpl(/^((?:\d[\d.,]* )?(?:seconds?|minutes?|hours?|days?)(?: \d[\d.,]* (?:seconds?|minutes?|hours?|days?))?) worked$/, function (t) {
    var inner = /^(.+?) worked$/.exec(t)[1];
    var time = translate(inner) || inner;
    return "工作时长：" + time;
  });
  tpl(/^Finish (.+)$/, function (t) {
    var inner = /^Finish (.+)$/.exec(t)[1];
    return "结束「" + (tr_label(inner) || inner) + "」";
  });
  // 收入片段（金额被 <span> 拆开，节点只剩 "(earnings: 2"）
  tpl(/^\(earnings: ([\d.,]+)$/, function (t) {
    return "（收入：" + /^\(earnings: ([\d.,]+)$/.exec(t)[1];
  });
  tpl(/^\(earnings: (.+)\)$/, function (t) {
    var inner = /^\(earnings: (.+)\)$/.exec(t)[1];
    return "（收入：" + (translate(inner) || inner) + "）";
  });
  tpl(/^There's not enough time left to earn more, but (.+?) might still learn something\.\.\.$/, function (t) {
    return "剩余时间不够再赚一轮了，不过「" + /^There's not enough time left to earn more, but (.+?) might/.exec(t)[1] + "」也许还能学到点什么……";
  });
  tpl(/^Next earnings in: (.+)$/, function (t) {
    var inner = /^Next earnings in: (.+)$/.exec(t)[1];
    return "下次结算：" + (translate(inner) || inner);
  });
  // 注意：这一行是 innerText += 连续拼接出来的，文本节点里会带上后面的技能名与进度
  tpl(/^Getting (.+?) base xp per in-game minute to\s*(.*)$/, function (t) {
    var m = /^Getting (.+?) base xp per in-game minute to\s*(.*)$/.exec(t);
    var rest = m[2] ? (translate(m[2]) || m[2]) : "";
    return "每游戏分钟获得 " + m[1] + " 基础经验 → " + rest;
  });
  tpl(/^Getting (.+?) base xp per gathering cycle to\s*(.*)$/, function (t) {
    var m = /^Getting (.+?) base xp per gathering cycle to\s*(.*)$/.exec(t);
    var rest = m[2] ? (translate(m[2]) || m[2]) : "";
    return "每采集轮获得 " + m[1] + " 基础经验 → " + rest;
  });
  tpl(/^(.+?) \(Maxed out!\)$/, function (t) {
    var inner = /^(.+?) \(Maxed out!\)$/.exec(t)[1];
    return (tr_label(inner) || inner) + "（已满级！）";
  });
  tpl(/^([A-Za-z][A-Za-z '\-\.\(\)]{0,40}?) \((\d+(?:\.\d+)?)%\s+\[(.+?) \/ (.+?)\]\)$/, function (t) {
    var m = /^([A-Za-z][A-Za-z '\-\.\(\)]{0,40}?) \((\d+(?:\.\d+)?)%\s+\[(.+?) \/ (.+?)\]\)$/.exec(t);
    var nm = tr_label(m[1]) || m[1];
    return nm + "（" + m[2] + "% ［" + m[3] + " / " + m[4] + "］）";
  });
  tpl(/^Reading the book, (.+?) left\.*$/, function (t) {
    var inner = /^Reading the book, (.+?) left/.exec(t)[1];
    return "读书中，剩余 " + (translate(inner) || inner);
  });
  // 游戏每秒会拿已翻译的文本按半角逗号重切并追加 ", X left"，导致中英混排累加
  tpl(/^(读书中.*?),\s*(.+?)\s+left\.*$/, function (t) {
    var m = /^(读书中.*?),\s*(.+?)\s+left/.exec(t);
    return "读书中，剩余 " + (translate(m[2]) || m[2]);
  });

  // 书籍加成列表项："- x1.2 all xp gain"
  tpl(/^- (.+)$/, function (t) {
    var rest = /^- (.+)$/.exec(t)[1];
    var tr = translate(rest);
    return tr === null ? null : "- " + tr;
  });
  tpl(/^Block : (.+)$/, function (t) {
    return "格挡：" + /^Block : (.+)$/.exec(t)[1];
  });

  // ---- 架势提示 ----
  tpl(/^(Randomly hits up to|Hits up to) (\d+) enemies$/, function (t) {
    var m = /^(Randomly hits up to|Hits up to) (\d+) enemies$/.exec(t);
    return (m[1] === "Randomly hits up to" ? "随机命中至多 " : "命中至多 ") + m[2] + " 个敌人";
  });

  // ---- 部件描述 ----
  tpl(/^A short blade made of (.+?), perfect for a dagger or a spear$/, function (t) {
    var mat = tr_label(/^A short blade made of (.+?),/.exec(t)[1]);
    return "由" + (mat || "材料") + "制成的短刃，正适合做匕首或长矛";
  });
  tpl(/^A long blade made of (.+?), perfect for a sword$/, function (t) {
    var mat = tr_label(/^A long blade made of (.+?),/.exec(t)[1]);
    return "由" + (mat || "材料") + "制成的长刃，正合做剑";
  });
  tpl(/^An axe head made of (.+)$/, function (t) {
    var mat = tr_label(/^An axe head made of (.+)$/.exec(t)[1]);
    return "由" + (mat || "材料") + "制成的斧头";
  });
  tpl(/^A hammer head made of (.+)$/, function (t) {
    var mat = tr_label(/^A hammer head made of (.+)$/.exec(t)[1]);
    return "由" + (mat || "材料") + "制成的锤头";
  });

  // 季节可用性（可能是逗号列表）："Available during Spring, Summer"
  tpl(/^(Not available|Available) during (.+)$/, function (t) {
    var m = /^(Not available|Available) during (.+)$/.exec(t);
    var seasons = m[2].split(/,\s*/).map(function (s) {
      return tr_label(s) || s;
    }).join("、");
    return (m[1] === "Available" ? "可参与季节：" : "不可用季节：") + seasons;
  });

  // 时间字符串："1 hour 30 minutes"、"5 minutes"
  tpl(/^(?:\d+ (?:seconds?|minutes?|hours?|days?))(?: \d+ (?:seconds?|minutes?|hours?|days?))*$/, function (t) {
    return t.replace(/(\d+) (seconds?|minutes?|hours?|days?)/g, function (_, n, u) {
      var map = { second: "秒", minute: "分", hour: "小时", day: "天" };
      return n + map[u.replace(/s$/, "")];
    });
  });

  // 升级所需时间："Next level in 5 minutes (1 hour realtime)"
  tpl(/^Next level in (.+?) \((.+?) realtime\)$/, function (t) {
    var m = /^Next level in (.+?) \((.+?) realtime\)$/.exec(t);
    return "距离下一级还需 " + (translate(m[1]) || m[1]) + "（现实 " + (translate(m[2]) || m[2]) + "）";
  });

  // 制作部件行："铁匕首, 40%, x2"
  tpl(/^(.+?), ([\d.]+)%, x(\d+)$/, function (t) {
    var m = /^(.+?), ([\d.]+)%, x(\d+)$/.exec(t);
    return (tr_label(m[1]) || m[1]) + "，" + m[2] + "%，x" + m[3];
  });

  // 技能类别："combat skills"
  tpl(/^(.+?) skills$/, function (t) {
    var base = /^(.+?) skills$/.exec(t)[1];
    var direct = tr_label(base + " skills");
    if (direct) return direct;
    var one = tr_label(base);
    return one ? one + "技能" : null;
  });

  tpl(/^Unlocked location ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^Unlocked location ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "解锁了新地点：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Unlocked activity ["\u201c](.+?)["\u201d] in location ["\u201c](.+?)["\u201d]$/, function (t) {
    var m = /^Unlocked activity ["\u201c](.+?)["\u201d] in location ["\u201c](.+?)["\u201d]$/.exec(t);
    return "在「" + (tr_label(m[2]) || m[2]) + "」解锁了活动「" + (tr_label(m[1]) || m[1]) + "」";
  });
  tpl(/^Unlocked action ["\u201c](.+?)["\u201d] in location ["\u201c](.+?)["\u201d]$/, function (t) {
    var m = /^Unlocked action ["\u201c](.+?)["\u201d] in location ["\u201c](.+?)["\u201d]$/.exec(t);
    return "在「" + (tr_label(m[2]) || m[2]) + "」解锁了行动「" + (tr_label(m[1]) || m[1]) + "」";
  });
  // 源码里的拼写错误 "wit" 也一并处理
  tpl(/^Unlocked action ["\u201c](.+?)["\u201d] wit ["\u201c](.+?)["\u201d]$/, function (t) {
    var m = /^Unlocked action ["\u201c](.+?)["\u201d] wit ["\u201c](.+?)["\u201d]$/.exec(t);
    return "与「" + (tr_label(m[2]) || m[2]) + "」解锁了行动「" + (tr_label(m[1]) || m[1]) + "」";
  });
  // 多个技能并列："Unlocked skill "A", "B", "C""
  tpl(/^Unlocked skill (.+)$/, function (t) {
    var rest = /^Unlocked skill (.+)$/.exec(t)[1];
    var names = rest.split(/, /).map(function (s) {
      var bare = s.replace(/^["\u201c]/, "").replace(/["\u201d]$/, "");
      return tr_label(bare) || bare;
    });
    return "解锁了技能「" + names.join("」「") + "」";
  });

  // ---- 消息记录（log_message 模板在运行时会插值，必须按模式翻译）----
  tpl(/^Finished a task for a quest: ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^Finished a task for a quest: ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "完成了任务进度：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Finished a quest: ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^Finished a quest: ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "完成了任务：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Made some progress in quest: ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^Made some progress in quest: ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "任务「" + (tr_label(v) || v) + "」有了进展";
  });
  tpl(/^Started a new quest: (.+)$/, function (t) {
    var v = /^Started a new quest: (.+)$/.exec(t)[1];
    return "新任务已开始：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Received a new quest: (.+)$/, function (t) {
    var v = /^Received a new quest: (.+)$/.exec(t)[1];
    return "接到了新任务：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Finished the book ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^Finished the book ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "读完了《" + (tr_label(v) || v) + "》";
  });
  tpl(/^You have learned a new stance: ["\u201c](.+?)["\u201d]$/, function (t) {
    var v = /^You have learned a new stance: ["\u201c](.+?)["\u201d]$/.exec(t)[1];
    return "学会了新架势：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Skill (.+?) upgraded to (.+)$/, function (t) {
    var m = /^Skill (.+?) upgraded to (.+)$/.exec(t);
    return "技能「" + (tr_label(m[1]) || m[1]) + "」进阶为「" + (tr_label(m[2]) || m[2]) + "」";
  });
  tpl(/^Obtained ([\d.]+)xp for clearing (.+?) for the first time$/, function (t) {
    var m = /^Obtained ([\d.]+)xp for clearing (.+?) for the first time$/.exec(t);
    return "首次通关「" + (tr_label(m[2]) || m[2]) + "」，获得 " + m[1] + " 经验";
  });
  tpl(/^Obtained additional ([\d.]+)xp for clearing (.+)$/, function (t) {
    var m = /^Obtained additional ([\d.]+)xp for clearing (.+)$/.exec(t);
    return "再次通关「" + (tr_label(m[2]) || m[2]) + "」，额外获得 " + m[1] + " 经验";
  });
  tpl(/^Gained ([\d.]+)xp$/, function (t) {
    return "获得 " + /^Gained ([\d.]+)xp$/.exec(t)[1] + " 经验";
  });
  tpl(/^(.+?) gained ([\d.]+)xp to (.+)$/, function (t) {
    var m = /^(.+?) gained ([\d.]+)xp to (.+)$/.exec(t);
    return m[1] + " 在「" + (tr_label(m[3]) || m[3]) + "」上获得 " + m[2] + " 经验";
  });
  tpl(/^(.+?) finished (.+)$/, function (t) {
    var m = /^(.+?) finished (.+)$/.exec(t);
    var act = tr_label(m[2]);
    return act ? m[1] + " 完成了「" + act + "」" : null;
  });
  tpl(/^(.+?) earned (.+)$/, function (t) {
    var m = /^(.+?) earned (.+)$/.exec(t);
    return m[1] + " 赚到了 " + m[2];
  });
  tpl(/^(.+?) obtained ["\u201c](.+?)["\u201d]$/, function (t) {
    var m = /^(.+?) obtained ["\u201c](.+?)["\u201d]$/.exec(t);
    var inner = tr_label(m[2]) || translate(m[2]) || m[2];
    return m[1] + " 获得了「" + inner + "」";
  });
  tpl(/^You should talk to (.+)$/, function (t) {
    var v = /^You should talk to (.+)$/.exec(t)[1];
    return "你该去找「" + (tr_label(v) || v) + "」谈谈";
  });
  tpl(/^You can now talk with (.+)$/, function (t) {
    var v = /^You can now talk with (.+)$/.exec(t)[1];
    return "你现在可以和「" + (tr_label(v) || v) + "」交谈了";
  });
  tpl(/^You can now trade with (.+)$/, function (t) {
    var v = /^You can now trade with (.+)$/.exec(t)[1];
    return "你现在可以和「" + (tr_label(v) || v) + "」交易了";
  });
  tpl(/^You can now use a crafting station in (.+)$/, function (t) {
    var v = /^You can now use a crafting station in (.+)$/.exec(t)[1];
    return "你现在可以在「" + (tr_label(v) || v) + "」使用制作台了";
  });
  tpl(/^Unlocked new recipe: (.+)$/, function (t) {
    var v = /^Unlocked new recipe: (.+)$/.exec(t)[1];
    return "解锁了新配方：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Unlocked new location: (.+)$/, function (t) {
    var v = /^Unlocked new location: (.+)$/.exec(t)[1];
    return "解锁了新地点：「" + (tr_label(v) || v) + "」";
  });
  tpl(/^Created (.+?) x(\d+) \[highest quality: ([\d.]+)% x(\d+)\] \(\+(\d+) xp\)$/, function (t) {
    var m = /^Created (.+?) x(\d+) \[highest quality: ([\d.]+)% x(\d+)\] \(\+(\d+) xp\)$/.exec(t);
    var name = tr_label(m[1]) || m[1];
    return "制作了「" + name + "」 x" + m[2] + "［最高品质 " + m[3] + "% x" + m[4] + "］（+" + m[5] + " 经验）";
  });
  tpl(/^Created (.+) \[([\d.]+)% quality\] x(\d+) \(\+(\d+) xp\)$/, function (t) {
    var m = /^Created (.+) \[([\d.]+)% quality\] x(\d+) \(\+(\d+) xp\)$/.exec(t);
    var name = tr_label(m[1]) || translate(m[1]) || m[1];
    return "制作了「" + name + "」［" + m[2] + "% 品质］x" + m[3] + "（+" + m[4] + " 经验）";
  });

  // 进入地点："[ Entering Shack ]"
  tpl(/^\[\s*Entering\s+(.+?)\s*\]$/, function (t) {
    var inner = /^\[\s*Entering\s+(.+?)\s*\]$/.exec(t)[1];
    return "[进入" + (tr_label(inner) || translate(inner) || inner) + "]";
  });

  // 移动选项："Go to [X] [1h]"、"Go back to [X]"、"Enter the [X] []" 等
  var TRAVEL = [
    // 自定义文案 + 时长："Venture into the [Deep forest] [49m]"
    [/^(.+?)\s+\[(\d+h(?:\d+m)?|\d+m)\]$/, function (m) {
      var head = translate(m[1]);
      if (head === null) return null;
      var dur = m[2].replace(/^(\d+)h(\d+)m$/, "$1小时$2分").replace(/^(\d+)h$/, "$1小时").replace(/^(\d+)m$/, "$1分");
      return head + "［" + dur + "］";
    }],
    [/^Go outside and to the \[(.+?)\] (.+)$/, function (m) { return "走出后前往[" + (tr_label(m[1]) || m[1]) + "] " + m[2]; }],
    [/^Go outside to the \[(.+?)\] (.+)$/, function (m) { return "走出到[" + (tr_label(m[1]) || m[1]) + "] " + m[2]; }],
    [/^Go towards the \[(.+?)\] (.+)$/, function (m) { return "朝[" + (tr_label(m[1]) || m[1]) + "]前进 " + m[2]; }],
    [/^Leave the safe path and walk into the \[(.+?)\] (.+)$/, function (m) { return "离开安全路径，走入[" + (tr_label(m[1]) || m[1]) + "] " + m[2]; }],
    [/^Go back to entrance (.+)$/, function (m) { return "返回入口 " + m[1]; }],
    [/^Go back to \[(.+?)\](.*)$/, function (m) { return "返回[" + (tr_label(m[1]) || m[1]) + "]" + m[2]; }],
    [/^Go to \[(.+?)\](.*)$/, function (m) { return "前往[" + (tr_label(m[1]) || m[1]) + "]" + m[2]; }],
    [/^Enter the \[(.+?)\](.*)$/, function (m) { return "进入[" + (tr_label(m[1]) || m[1]) + "]" + m[2]; }],
    [/^Trade with (.+)$/, function (m) { return "与" + (tr_label(m[1]) || m[1]) + "交易"; }],
  ];
  for (var ti = 0; ti < TRAVEL.length; ti++) {
    (function (pair) {
      tpl(pair[0], function (t) {
        var m = pair[0].exec(t);
        return m ? pair[1](m) : null;
      });
    })(TRAVEL[ti]);
  }

  // 战斗数值："6dmg"、"Hit: 94%"（由通用标签规则处理标签，这里补值）
  tpl(/^([\d.]+)dmg$/, function (t) { return /^([\d.]+)dmg$/.exec(t)[1] + " 伤害"; });

  // 生命流失："60/60 (-5/s) hp"
  tpl(/^([\d.]+)\/([\d.]+) \((.+)\) hp$/, function (t) {
    var m = /^([\d.]+)\/([\d.]+) \((.+)\) hp$/.exec(t);
    return m[1] + "/" + m[2] + "（" + m[3] + "）生命";
  });

  // 倍率写法："EP x0.5"、"stamina efficiency x0.75"、"dark II"
  tpl(/^(.+?) x([\d.]+)$/, function (t) {
    var m = /^(.+?) x([\d.]+)$/.exec(t);
    var lab = tr_label(m[1]);
    return lab ? lab + " x" + m[2] : null;
  });
  tpl(/^([a-z][a-z \-]*) (I|II|III|IV|V)$/, function (t) {
    var m = /^([a-z][a-z \-]*) (I|II|III|IV|V)$/.exec(t);
    var lab = tr_label(m[1]);
    return lab ? lab + " " + m[2] : null;
  });

  // 技能等级："窄处腾挪：level 0/60"、"lvl 3: ???"
  tpl(/^(.+?)：level ([\d.]+)\/([\d.]+)$/, function (t) {
    var m = /^(.+?)：level ([\d.]+)\/([\d.]+)$/.exec(t);
    return m[1] + "：等级 " + m[2] + "/" + m[3];
  });
  tpl(/^lvl (\d+): (.+)$/, function (t) {
    var m = /^lvl (\d+): (.+)$/.exec(t);
    var rest = m[2];
    if (/^\?{2,}$/.test(rest)) rest = "？？？";
    else { var tr = translate(rest); if (tr !== null) rest = tr; }
    return "等级 " + m[1] + "：" + rest;
  });

  // 技能等级提示："Fishing level: +3"、"Iron will level: +2"
  tpl(/^(.+?) level: ([-+x]?[\d.]+)$/, function (t) {
    var m = /^(.+?) level: ([-+x]?[\d.]+)$/.exec(t);
    var nm = tr_label(m[1]);
    return nm ? nm + " 等级：" + m[2] : null;
  });

  // 时长："1h30m"、"45m"、"(+1.2/s)"
  tpl(/^(\d+)h(\d+)m$/, function (t) {
    var m = /^(\d+)h(\d+)m$/.exec(t);
    return m[1] + "小时" + m[2] + "分";
  });
  tpl(/^(\d+)m$/, function (t) { return /^(\d+)m$/.exec(t)[1] + "分"; });
  tpl(/^(\d+)h$/, function (t) { return /^(\d+)h$/.exec(t)[1] + "小时"; });
  tpl(/^\(([-+]?[\d.]+)\/s\)$/, function (t) { return "（" + /^\(([-+]?[\d.]+)\/s\)$/.exec(t)[1] + "／秒）"; });

  // 通用加成句式："Multiplies X by N."、"Multiplies AP with axes by 1.231"
  tpl(/^Multiplies (.+?) by ([\d.]+)\.?$/, function (t) {
    var m = /^Multiplies (.+?) by ([\d.]+)\.?$/.exec(t);
    if (/additive effects/.test(m[1])) return null;
    var lab = tr_label(m[1]);
    if (!lab) {
      var sub = translate(m[1]);
      if (sub) lab = sub;
    }
    return "使" + (lab || m[1]) + "乘以 " + m[2].replace(/\.$/, "");
  });

  // 加法型加成："Increases critical hit chance by 17 points"
  tpl(/^Increases (.+?) by ([\d.]+) points?$/, function (t) {
    var m = /^Increases (.+?) by ([\d.]+) points?$/.exec(t);
    var lab = tr_label(m[1]);
    return "使" + (lab || m[1]) + "提高 " + m[2] + " 点";
  });

  // 除法型："Divides effects of poisons by 3.98"
  tpl(/^Divides (.+?) by ([\d.]+)$/, function (t) {
    var m = /^Divides (.+?) by ([\d.]+)$/.exec(t);
    var lab = tr_label(m[1]);
    return "使" + (lab || m[1]) + "除以 " + m[2];
  });
  tpl(/^Multiplies damage dealt with (.+?) by ([\d.]+)\.?$/, function (t) {
    var m = /^Multiplies damage dealt with (.+?) by ([\d.]+)\.?$/.exec(t);
    var lab = tr_label(m[1]);
    return "使使用" + (lab || m[1]) + "造成的伤害乘以 " + m[2];
  });

  // 声望："Village reputation"
  tpl(/^(.+?) reputation$/, function (t) {
    var lab = tr_label(/^(.+?) reputation$/.exec(t)[1]);
    return lab ? lab + "声望" : null;
  });

  // 解锁提示："Unlocked skill \"Meditation\""、"Gained the ability of \"swimming\""
  tpl(/^Unlocked skill "(.+)"$/, function (t) {
    var inner = /^Unlocked skill "(.+)"$/.exec(t)[1];
    return "解锁了技能「" + (tr_label(inner) || inner) + "」";
  });
  tpl(/^Gained the ability of "(.+)"$/, function (t) {
    var inner = /^Gained the ability of "(.+)"$/.exec(t)[1];
    return "获得了「" + (tr_label(inner) || tr_label(inner.charAt(0).toUpperCase() + inner.slice(1)) || inner) + "」的能力";
  });

  // 品质上限："Quality cap: 150% for components"
  tpl(/^Quality cap: (.+)$/, function (t) {
    var rest = /^Quality cap: (.+)$/.exec(t)[1];
    var out = rest
      .replace(/for components/g, "（部件）")
      .replace(/for comps/g, "（部件）")
      .replace(/for eq/g, "（装备）");
    return "品质上限：" + out;
  });

  // 技能描述模板："Multiplies strength, agility and stamina by 1.34. Reduces thin air effects"
  tpl(/^Multiplies (.+?) by ([\d.]+)\. Reduces thin air effects$/, function (t) {
    var m = /^Multiplies (.+?) by ([\d.]+)\. Reduces thin air effects$/.exec(t);
    var inner = tr_label(m[1]) || m[1];
    return "使" + inner + "乘以 " + m[2] + "，并减弱稀薄空气的影响";
  });
  tpl(/^Multiplies additive effects of (foods|medicines) by ([\d.]+) and multiplicative effects by ([\d.]+)$/, function (t) {
    var m = /^Multiplies additive effects of (foods|medicines) by ([\d.]+) and multiplicative effects by ([\d.]+)$/.exec(t);
    return (m[1] === "foods" ? "食物" : "药物") + "的固定效果 x" + m[2] + "，倍率效果 x" + m[3];
  });

  // 短语型加成目标
  tpl(/^damage dealt with (.+?)\.?$/, function (t) {
    var lab = tr_label(/^damage dealt with (.+?)\.?$/.exec(t)[1]);
    return lab ? "使用" + lab + "造成的伤害" : null;
  });
  tpl(/^AP with (.+)$/, function (t) {
    var lab = tr_label(/^AP with (.+)$/.exec(t)[1]);
    return lab ? "使用" + lab + "的AP" : null;
  });
  tpl(/^([AE]P) against (.+)$/, function (t) {
    var m = /^([AE]P) against (.+)$/.exec(t);
    var lab = tr_label(m[2]);
    return lab ? "对" + lab + "的" + m[1] : null;
  });
  tpl(/^(.+?)-type enemies$/, function (t) {
    var inner = /^(.+?)-type enemies$/.exec(t)[1];
    var map = { large: "大型", small: "小型", medium: "中型" };
    return map[inner] || null;
  });

  // 整句型
  tpl(/^Adds ([\d.]+) base damage to unarmed attacks$/, function (t) {
    return "为徒手攻击增加 " + /^Adds ([\d.]+) base/.exec(t)[1] + " 基础伤害";
  });
  tpl(/^Increases base defense by ([\d.]+)$/, function (t) {
    return "使基础防御提高 " + /^Increases base defense by ([\d.]+)$/.exec(t)[1];
  });
  tpl(/^Increases (cold|heat) tolerance by ([\d.]+)$/, function (t) {
    var m = /^Increases (cold|heat) tolerance by ([\d.]+)$/.exec(t);
    return "使" + (m[1] === "cold" ? "耐寒" : "耐热") + "提高 " + m[2];
  });
  tpl(/^Multiplies (.+?) by ([\d.]+)\. Reduces environmental penalty in aquatic areas\.$/, function (t) {
    var m = /^Multiplies (.+?) by ([\d.]+)\. Reduces environmental penalty in aquatic areas\.$/.exec(t);
    var lab = tr_label(m[1]) || translate(m[1]) || m[1];
    return "使" + lab + "乘以 " + m[2] + "，并降低水域的环境惩罚。";
  });

  tpl(/^Lowers trader cost multiplier to ([\d.]+)% of original value$/, function (t) {
    var m = /^Lowers trader cost multiplier to ([\d.]+)% of original value$/.exec(t);
    return "将商人价格倍率降至原价的 " + m[1] + "%";
  });

  // 数值 + 单位："2,846,217 / 13,292,280 xp"、"1305/1306 (+0.5/s) stamina"
  tpl(/^([\d,]+) \/ ([\d,]+) xp$/, function (t) {
    var m = /^([\d,]+) \/ ([\d,]+) xp$/.exec(t);
    return m[1] + " / " + m[2] + " 经验";
  });
  tpl(/^([\d.]+)\/([\d.]+) \(([-+]?[\d.]+)\/s\)\s+(stamina|hp)$/, function (t) {
    var m = /^([\d.]+)\/([\d.]+) \(([-+]?[\d.]+)\/s\)\s+(stamina|hp)$/.exec(t);
    return m[1] + "/" + m[2] + "（" + m[3] + "／秒）" + UNITS[m[4]];
  });
  tpl(/^([\d.]+) \(with global: ([\d.]+)\)$/, function (t) {
    var m = /^([\d.]+) \(with global: ([\d.]+)\)$/.exec(t);
    return m[1] + "（含全局：" + m[2] + "）";
  });

  // 连击伤害："106dmg x4"
  tpl(/^([\d.]+)dmg x(\d+)$/, function (t) {
    var m = /^([\d.]+)dmg x(\d+)$/.exec(t);
    return m[1] + " 伤害 x" + m[2];
  });

  // 倍率说明："Increases low stamina stat multiplier to x0.5 (originally x0.5)"
  tpl(/^Increases low stamina stat multiplier to x([\d.]+) \(originally x([\d.]+)\)$/, function (t) {
    var m = /^Increases low stamina stat multiplier to x([\d.]+) \(originally x([\d.]+)\)$/.exec(t);
    return "将低体力属性倍率提升到 x" + m[1] + "（原本 x" + m[2] + "）";
  });

  // 引号包裹的台词："Believe in me that believes in you!"
  tpl(/^"(.+)"$/, function (t) {
    var inner = /^"(.+)"$/.exec(t)[1];
    var hit = tr_label(inner);
    return hit ? "「" + hit + "」" : null;
  });

  // 通用动作+目标+耗时："Go outside to [Village] []"、"Leave the crab spawning grounds [20m]"
  tpl(/^(.+?) \[([^\]]*)\] ?(\[[^\]]*\])?$/, function (t) {
    var m = /^(.+?) \[([^\]]*)\] ?(\[[^\]]*\])?$/.exec(t);
    var prefix = tr_label(m[1]);
    if (!prefix) return null;
    var inner = tr_label(m[2]);
    return prefix + " [" + (inner || m[2]) + "]" + (m[3] ? " " + m[3] : "");
  });

  // 技能等级提示："Tight maneuvers has reached level 2"
  tpl(/^(.+?) has reached level (\d+)$/, function (t) {
    var m = /^(.+?) has reached level (\d+)$/.exec(t);
    return (tr_label(m[1]) || m[1]) + " 已达到 " + m[2] + " 级";
  });

  // 修正后的倍率："EP x0.342 [base: x0.333]"
  tpl(/^(.+?) x([\d.]+) \[base: x([\d.]+)\]$/, function (t) {
    var m = /^(.+?) x([\d.]+) \[base: x([\d.]+)\]$/.exec(t);
    var lab = tr_label(m[1]);
    return lab ? lab + " x" + m[2] + "（基础 x" + m[3] + "）" : null;
  });

  // 每秒流失："(-5/s) hp"
  tpl(/^\(([-\d.]+)\/s\) hp$/, function (t) {
    return "（" + /^\(([-\d.]+)\/s\) hp$/.exec(t)[1] + "／秒）生命";
  });

  // 生命条整体："60/60 (-5/s) hp"
  tpl(/^([\d.]+)\/([\d.]+) \(([-\d.]+)\/s\) hp$/, function (t) {
    var m = /^([\d.]+)\/([\d.]+) \(([-\d.]+)\/s\) hp$/.exec(t);
    return m[1] + "/" + m[2] + "（" + m[3] + "／秒）生命";
  });

  // 季节限制："Not available during Winter"
  tpl(/^Not available during (.+)$/, function (t) {
    var m = /^Not available during (.+)$/.exec(t);
    var s = tr_label(m[1]);
    return s ? "不可用（季节：" + s + "）" : null;
  });

  // 日期行："01/04/999 08:04, Summer, Mon,"
  tpl(/^(\S+ \S+), (Spring|Summer|Autumn|Winter), (Mon|Tue|Wed|Thu|Fri|Sat|Sun),?$/, function (t) {
    var m = /^(\S+ \S+), (Spring|Summer|Autumn|Winter), (Mon|Tue|Wed|Thu|Fri|Sat|Sun),?$/.exec(t);
    var season = { Spring: "春", Summer: "夏", Autumn: "秋", Winter: "冬" }[m[2]];
    var day = tr_label(m[3]);
    return m[1] + "，" + season + "季，" + (day || m[3]);
  });

  function tr_label(label) {
    var hit = MAP[label] || NORM_MAP[normalize(label)];
    if (hit) return hit;
    // 大小写无关匹配走预建索引，避免每次遍历整张词典（O(1) 而不是 O(n)）
    var low = LOWER_MAP[String(label).toLowerCase()];
    return low === undefined ? null : low;
  }

  // 单条加成片段："12 str"、"x1.1 Running xp gain"、"+0.1 stam regen"、"x1.05 all skill xp gain"
  // 未解锁名称统一成「？？？」，其余走词典
  function mask_name(s) {
    var t = String(s).trim();
    if (/^\?{2,}$/.test(t)) return "？？？";
    return tr_label(t) || t;
  }

  // 技能效果里的复合名词："drop chances from Beasts"
  tpl(/^drop chances? from (.+)$/, function (t) {
    var tag = /^drop chances? from (.+)$/.exec(t)[1];
    var hit = tr_label(tag);
    if (!hit && /s$/.test(tag)) hit = tr_label(tag.slice(0, -1));
    return (hit || tag) + "的掉落几率";
  });

  function tr_fragment(f) {
    var t2 = f.trim();
    if (!t2) return null;
    if (/^\?+$/.test(t2)) return "？？？";
    var m;
    // 未解锁技能名占位："x1.05 ?????? xp gain"
    if ((m = /^([-+xX]?[\d.]+) (\?{2,}) xp gain$/.exec(t2))) {
      return "？？？ 经验获取 " + m[1];
    }
    if ((m = /^([-+xX]?[\d.]+) (.+?) xp gain$/.exec(t2))) {
      var nm = tr_label(m[2]);
      if (nm) return nm + (/[\u4e00-\u9fff]$/.test(nm) ? "" : " ") + "经验获取 " + m[1];
      if (/^(all skill|all|all skills)$/.test(m[2])) return "全部技能经验获取 " + m[1];
      return null;
    }
    if ((m = /^([-+xX]?[\d.]+) (.+?) level$/.exec(t2))) {
      var nm2 = tr_label(m[2]);
      if (nm2) return nm2 + " 等级 " + m[1];
      return null;
    }
    if ((m = /^([-+x]?[\d.]+) (.+)$/.exec(t2))) {
      var lab = tr_label(m[2]);
      if (lab) return m[1] + " " + lab;
    }
    var whole = MAP[t2] || NORM_MAP[normalize(t2)];
    return whole === undefined ? null : whole;
  }

  // 处理「中文前缀 + 后追加的英文尾巴」：游戏常用 innerText += 连续追加，
  // 前面已翻成中文、后面又拼进一段英文，整串就再也匹配不上词典了。
  function translate_tails(s) {
    var m = /^([\s\S]*[\u4e00-\u9fff][\s\S]*?)([A-Za-z][\s\S]*)$/.exec(s);
    if (!m) return null;
    var head = m[1];
    var tail = m[2];
    if (!/[A-Za-z]{2}/.test(tail)) return null;
    // 尾巴必须带数字/括号/百分号之类，避免把中文句子里的孤词（EP/AP）误翻
    if (!/[^A-Za-z]/.test(tail)) return null;
    var t = translate(tail);
    return t === null ? null : head + t;
  }

  // 同一串文本会被反复翻译（日志/提示框每秒重绘），这里做结果缓存
  var TRANSLATE_CACHE = new Map();
  var TRANSLATE_CACHE_MAX = 8192;
  function translate(text) {
    if (text == null) return null;
    if (typeof text !== "string") return translate_uncached(text);
    var cached = TRANSLATE_CACHE.get(text);
    if (cached !== undefined) return cached;
    var result = translate_uncached(text);
    if (TRANSLATE_CACHE.size >= TRANSLATE_CACHE_MAX) TRANSLATE_CACHE.clear();
    TRANSLATE_CACHE.set(text, result);
    return result;
  }

  function translate_uncached(text) {
    if (!text) return null;
    if (!/[A-Za-z]/.test(text)) return null; // 已是中文/纯数字 → 跳过
    var trimmed = text.trim();
    if (!trimmed) return null;

    var direct = MAP[trimmed];
    if (direct === undefined) direct = NORM_MAP[normalize(trimmed)];
    if (direct === undefined) direct = LOWER_MAP[trimmed.toLowerCase()];
    if (direct !== undefined) return direct;

    // 「标签:」无值
    var only = /^([A-Za-z][A-Za-z0-9 '()*%\-\/\.]{0,60}):$/.exec(trimmed);
    if (only) {
      var lab0 = tr_label(only[1]);
      if (lab0) return lab0 + "：";
    }

    // 「整句 + 句末冒号」（解锁旁白拼上冒号后再接解锁提示）
    if (/:$/.test(trimmed) && trimmed.length > 20) {
      var sen = trimmed.slice(0, -1);
      var senTr = translate(sen);
      if (senTr !== null) return senTr + "：";
    }

    // 「标签: 数值」型
    var m = /^([A-Za-z][A-Za-z0-9 '()*%\-\/\.]{0,60})(:\s*)(.+)$/.exec(trimmed);
    if (m) {
      var lab = tr_label(m[1]);
      if (lab) {
        var val = m[3];
        var vhit = MAP[val] || NORM_MAP[normalize(val)];
        if (vhit) {
          val = vhit;
        } else {
          // 值被引号包着时（"Lost memory" / “Lost memory”），去掉引号再查词
          var q = /^[\u201c\u201d"'\u300c](.+?)[\u201c\u201d"'\u300d]$/.exec(val);
          if (q) {
            var inner = MAP[q[1]] || NORM_MAP[normalize(q[1])];
            if (inner) val = "「" + inner + "」";
          }
        }
        val = val
          .replace(/for components/g, "（部件）")
          .replace(/for comps/g, "（部件）")
          .replace(/for eq/g, "（装备）");
        var tail = /^(.*?) real time$/.exec(val);
        if (tail) val = tail[1] + "（现实时间）";
        if (!vhit) {
          for (var vi = 0; vi < TEMPLATES.length; vi++) {
            if (TEMPLATES[vi][0].test(val)) {
              var vout = TEMPLATES[vi][1](val);
              if (vout) { val = vout; break; }
            }
          }
        }
        return lab + "：" + fix_brackets(val);
      }
    }

    for (var i = 0; i < TEMPLATES.length; i++) {
      var r = TEMPLATES[i];
      if (r[0].test(trimmed)) {
        var out = r[1](trimmed);
        if (out) return out;
      }
    }

    // 「a, b and c」并列短语
    var conj = /^(.+?), (.+?) and (.+)$/.exec(trimmed);
    if (conj) {
      var a = tr_label(conj[1]), b = tr_label(conj[2]), c = tr_label(conj[3]);
      if (a && b && c) return a + "、" + b + "与" + c;
    }

    // 未知占位："???"
    if (/^\?{2,}$/.test(trimmed)) return "？？？";

    // 中英混排（多半是「已翻译的前缀 + 后追加的英文尾段」）：放在模板之后，
    // 这样「中文角色名 + 英文句式」仍能整句命中模板，只有真接不上时才只翻尾部
    if (/[\u4e00-\u9fff]/.test(trimmed) && /[A-Za-z]{2}/.test(trimmed)) {
      var mixed = translate_tails(trimmed);
      if (mixed !== null) return mixed;
    }

  // 单条加成片段："+1 int"、"x1.05 hero xp gain"
    var one = tr_fragment(trimmed);
    if (one !== null) return one;

    // 逗号分隔的加成列表："lv 3: x1.02 attack speed, x1.1 Running xp gain"
    if (trimmed.indexOf(", ") !== -1) {
      var parts = trimmed.replace(/,\s*$/, "").split(", ");
      var done = [];
      var resolved = 0;
      for (var pi = 0; pi < parts.length; pi++) {
        var seg = tr_fragment(parts[pi]);
        if (seg === null) { done.push(parts[pi]); } else { done.push(seg); resolved++; }
      }
      // 允许部分片段无法识别（例如尚未解锁的技能名用 ???? 占位），至少要翻出一部分才采用
      if (resolved > 0) return done.join("，");
    }

    // 拼接式长描述
    var phr = apply_phrases(trimmed);
    if (phr !== null) return phr;

    // 中文前缀 + 追加英文尾巴
    var tail = translate_tails(trimmed);
    if (tail !== null) return tail;

    return null;
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 0 };
  var ATTRS = ["title", "placeholder", "alt", "aria-label"];

  function in_icon(node) {
    var p = node.parentNode;
    while (p && p.nodeType === 1) {
      if (p.classList && (p.classList.contains("material-icons") || p.classList.contains("no-translate"))) return true;
      p = p.parentNode;
    }
    return false;
  }

  // 被 <span> 拆开的孤立收尾括号：只有父元素里确实存在我们输出的全角开括号时才转换
  function fix_lone_bracket(node) {
    var raw = node.nodeValue;
    if (!raw || !/^[)\]]$/.test(raw.trim())) return false;
    var parent = node.parentNode;
    if (!parent || nodeType_ok(parent) === false) return false;
    var ptext = parent.textContent || "";
    if (raw.trim() === ")" && ptext.indexOf("（") !== -1) { node.nodeValue = "）"; return true; }
    if (raw.trim() === "]" && ptext.indexOf("［") !== -1) { node.nodeValue = "］"; return true; }
    return false;
  }

  function nodeType_ok(n) { return n.nodeType === 1; }

  function do_text(node) {
    var raw = node.nodeValue;
    if (!raw) return;
    // 孤立收尾括号要在「无字母直接返回」之前处理
    if (fix_lone_bracket(node)) return;
    if (!/[A-Za-z]/.test(raw)) return;
    var parent = node.parentNode;
    if (!parent || parent.nodeType !== 1) return;
    if (SKIP_TAGS[parent.tagName] === 1) return;
    if (in_icon(node)) return;

    if (fix_lone_bracket(node)) return;

    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    var out = translate(raw);
    if (out === null && raw.indexOf("\n") !== -1) {
      var lines = raw.split("\n").map(function (line) {
        if (!/[A-Za-z]/.test(line)) return line;
        var o = translate(line);
        return o === null ? line : o;
      });
      out = lines.join("\n");
    }
    if (out === null) return;
    if (out === raw) return;
    // 译文以中文标点收尾时不必保留原文的尾随空格（避免「部位： 武器」这种空隙）
    if (/[：，。！？、；）」』]$/.test(out)) trail = "";
    if (/^[，。！？、；：]/.test(out)) lead = "";
    node.nodeValue = lead + out + trail;
  }

  function do_attrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      var val = el.getAttribute(a);
      if (!val || !/[A-Za-z]/.test(val)) continue;
      var out = translate(val);
      if (out === null) continue;
      el.setAttribute(a, out);
    }
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit")) {
      var v = el.value;
      if (v && /[A-Za-z]/.test(v)) {
        var o = translate(v);
        if (o !== null) el.value = o;
      }
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { do_text(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < els.length; i++) do_attrs(els[i]);
    if (root.nodeType === 1) do_attrs(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var n;
    var batch = [];
    while ((n = walker.nextNode())) batch.push(n);
    for (var j = 0; j < batch.length; j++) do_text(batch[j]);
  }

  function on_mutations(records) {
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      if (rec.type === "characterData") { do_text(rec.target); continue; }
      if (rec.type === "attributes") { do_attrs(rec.target); continue; }
      for (var j = 0; j < rec.addedNodes.length; j++) {
        var node = rec.addedNodes[j];
        if (node.nodeType === 3) do_text(node);
        else if (node.nodeType === 1) walk(node);
      }
    }
  }

  walk(document.documentElement);

  var observer = new MutationObserver(on_mutations);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });

  //选项面板里的语言勾选框在中文模式下应处于勾选状态
  function sync_language_checkbox() {
    var cb = document.getElementById("options_chinese_language");
    if (cb && !cb.checked) cb.checked = true;
  }
  document.addEventListener("DOMContentLoaded", sync_language_checkbox);
  sync_language_checkbox();

  window.__zh_patch = { version: "zh-cn-2", templates: TEMPLATES, translate: translate, dict: MAP };
  console.log("[汉化补丁] 覆盖层 " + window.__zh_patch.version + " 已加载，词典 " + Object.keys(MAP).length + " 条");
})();
