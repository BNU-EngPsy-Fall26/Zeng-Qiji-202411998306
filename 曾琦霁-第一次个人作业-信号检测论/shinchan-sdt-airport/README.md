# 春日部机场 · Signal Detection Security Check

实验以“机场行李安检”为情境，将信号检测理论（Signal Detection Theory, SDT）做成可交互的安检任务，并在实验结束后计算 Hit、Miss、False Alarm、Correct Rejection、Hit Rate、False Alarm Rate、Accuracy、d′ 和 criterion c。

---

## 一、如何运行（本项目无需安装环境）

### 方法 A：直接用浏览器打开

1. 下载并解压整个 `shinchan-sdt-airport` 文件夹。
2. **不要只把 `index.html` 单独拿出来**，需要保留 `assets/`、`style.css` 和 `script.js` 的相对路径。
3. 双击文件夹中的 **`index.html`**。
4. 推荐使用最新版 **Google Chrome / Microsoft Edge** 打开。
5. 点击首页“开始实验”，依次进入参数设置 → 练习 → 30 个正式 trial → 结果页。

本项目是纯 HTML + CSS + JavaScript 实现，正常情况下**不需要安装 Python、Node.js 或其他依赖，也不需要启动后端服务器**。

### 方法 B：如果浏览器对本地文件有限制

如果某些浏览器环境不允许直接使用本地文件，可在项目文件夹中启动一个简单的静态服务器。例如电脑已经安装 Python 时，在终端进入项目目录后运行：

```bash
python -m http.server 8000
```

然后在浏览器打开：

```text
http://localhost:8000
```

停止服务器可在终端按 `Ctrl + C`。

---

## 二、项目文件结构

```text
shinchan-sdt-airport/
├── index.html          # 页面结构：封面、参数设置、练习、正式实验、结果页
├── style.css           # 全部视觉样式与响应式布局
├── script.js           # 实验状态、trial生成、反应记录、SDT计算、图表与历史记录
├── README.md           # 项目说明与运行方法
└── assets/             # 蜡笔小新场景、角色和危险物品图片
    ├── home-cover.png
    ├── shinchan.jpg
    ├── shinchan-transparent.png
    ├── buriburi.jpg
    ├── buriburi-transparent.png
    ├── target.png
    └── target-transparent.png
```

代码已经按功能增加注释，主要结构如下：

- `index.html`：按实验阶段组织 5 个页面 screen。
- `style.css`：按首页、设置页、实验页、结果页、加分项等模块组织样式。
- `script.js`：按“状态与 DOM → 参数设置 → 刺激生成 → 练习 → 正式实验 → SDT 计算 → 结果图表 → 独立概念演示 → 历史记录”组织，并在关键函数前加入说明。

---

## 三、实验任务与参数

- **实验场景**：春日部机场行李安检。
- **Signal**：彩色“肥嘟嘟左卫门”危险物品刺激。
- **Noise**：普通卡通行李物品。
- **正式试次**：30 trials。
- **刺激构成**：9 个 Signal + 21 个 Noise，即 P(Signal)=30%。
- **反应方式**：`SAFE` / `CHECK` 二分类判断。
- **刺激呈现时间**：1.8 s。
- **难度**：EASY / MEDIUM / HARD，通过目标大小、遮挡数量和视觉干扰操纵辨别难度。
- **策略**：STRICT / FAST，通过漏检与误拦的代价改变决策标准，不直接改变刺激难度。

正式实验前包含 3 个练习 trial，用于熟悉 SAFE / CHECK 操作；正式实验不提供即时正确性反馈。

---

## 四、SDT 结果计算

结果页展示四类反应：

- Hit：Signal + CHECK
- Miss：Signal + SAFE
- False Alarm：Noise + CHECK
- Correct Rejection：Noise + SAFE

并计算：

- `Hit Rate = P(H)`
- `False Alarm Rate = P(FA)`
- `Accuracy`
- `d′ = z(P(H)) − z(P(FA))`
- `c = −0.5 × [z(P(H)) + z(P(FA))]`

为避免极端情况下 `P(H)=0/1` 或 `P(FA)=0/1` 导致 d′ / c 出现无穷或 `NaN`，程序使用 log-linear correction：

```text
P(H)  = (Hit + 0.5) / (Signal trials + 1)
P(FA) = (FA  + 0.5) / (Noise trials  + 1)
```

因此结果页的百分比均以 0–100% 显示，不会把概率直接当作百分数而出现超过 100% 的情况。

---

## 五、交互式

### 1. 独立 SDT 概念可视化

结果页的“互动概念可视化”独立于本轮正式实验，不读取本轮的 d′、c 或反应数据。

可以分别调节：

- **d′ 滑块**：改变 Signal 与 Noise 分布的分离程度，并实时改变理论 ROC 曲线的形状。
- **c 滑块**：改变决策标准，并实时改变理论 P(H)、P(FA) 以及 ROC 曲线上的当前决策点。

因此可以直接观察：

> d′ 主要反映“能不能分辨 Signal 和 Noise”；c 主要反映“在不确定时更倾向 SAFE 还是 CHECK”。

### 2. 多轮实验数据比较

每完成一轮实验，程序使用浏览器 `localStorage` 自动保存最近 8 轮数据。结果页可以选择 d′、c、策略得分或准确率进行最近 6 轮的可视化比较。

### 3. 场景化与界面设计

使用蜡笔小新风格的机场封面、角色、扫描动画和安检监督员，提高实验的情境代入感。

---

## 六、操作流程

```text
首页
  ↓
参数设置（STRICT / FAST + EASY / MEDIUM / HARD）
  ↓
3 个练习 trial
  ↓
30 个正式 trial
  ↓
自动计算 SDT 指标
  ↓
结果页
  ├─ 本轮 SDT 结果
  ├─ Signal / Noise 分布
  ├─ 本轮理论 ROC
  ├─ 独立的 d′ / c 互动概念可视化
  └─ 最近多轮数据比较
```
