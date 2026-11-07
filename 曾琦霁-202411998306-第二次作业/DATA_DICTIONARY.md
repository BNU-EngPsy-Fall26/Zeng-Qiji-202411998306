# 数据字典

所有行为试次数据均包含匿名参与者编号、实验标识、条件和会话标识。时间字段以毫秒记录；实验中使用 `performance.now()` 作为高分辨率计时来源。

## 通用字段

| 字段 | 含义 |
|---|---|
| `experiment` | `aviation_monitoring` 或 `visual_search` |
| `participant` | 匿名参与者编号；不得填写姓名或学号 |
| `session_id` | 本次实验会话的唯一标识 |
| `condition` | A、B 或 C |
| `condition_name` | 条件名称 |
| `trial` | 当前会话正式试次序号 |
| `trial_in_block` | 当前条件区块中的试次序号 |
| `stimulus_id` | 预先生成的刺激编号；用于跨条件匹配 |
| `correct` | 1=正确，0=错误 |
| `rt_ms` | 反应时；实验一从实际绘制的异常越界帧起算；实验二从完整搜索画面出现（预览条件为新项目加入）起算 |

## 实验一：`aviation_monitoring`

| 字段 | 含义 |
|---|---|
| `trial_type` | `anomaly` 真实异常；`near_miss` 接近阈值后恢复 |
| `target_gauge` | `airspeed`、`altitude`、`bank`、`temperature` |
| `direction` | `upper` 上越界；`lower` 下越界 |
| `signal_rate` | `fast` 较快轨迹；`slow` 较慢轨迹；近失误为 `moderate` |
| `signal_velocity_units_s` | 根据轨迹参数计算的变化速度，单位取决于仪表 |
| `nominal_crossing_ms` | 计划中的阈值交叉时间 |
| `event_time_ms` | 实际首次绘制出阈值状态的时刻，相对试次开始 |
| `cue_type` | `none`、`reactive` 事后提示、`predictive` 预测提示 |
| `cue_time_ms` | 提示首次显示的相对时间 |
| `cue_lead_ms` | 预测提示到实际阈值显示的提前量；仅真实异常且提示已触发时记录 |
| `response_time_ms` | 被试按键/点击的相对时间 |
| `response_class` | `hit`、`miss`、`premature`、`late`、`false_alarm`、`correct_rejection` |
| `predictive_validity` | C 条件下为 `valid`、`missed_prediction`、`false_alarm` 或 `no_prediction`；其余条件为 `not_applicable` |
| `prediction_triggered` | C 条件是否触发预测提示（1/0） |
| `distractor_gauges` | 两次短暂扰动出现在哪些非目标仪表 |
| `distractor_event_times_ms` | 两次扰动相对试次开始的时间 |
| `distractor_count` | 每试次短暂扰动次数 |
| `nominal_crossing_ms` | 预设越界时点；实际事件以 `event_time_ms` 为准 |

## 实验二：`visual_search`

| 字段 | 含义 |
|---|---|
| `condition_name` | `特征搜索`、`联合搜索`、`预览搜索（改进）` |
| `set_size` | 搜索集大小：4、8、16、32 |
| `target_present` | 1=目标存在；0=目标缺失 |
| `trial_type` | `target_present` 或 `target_absent`；练习为 `practice_present` / `practice_absent` |
| `target_color` | 目标颜色，固定为 `red` |
| `target_orient` | 目标朝向，固定为 `vertical` |
| `preview` | 1=预览条件（先呈现一半干扰项）；0=同时呈现 |
| `preview_count` | 预览阶段先出现的干扰项数量；预览条件为 `floor(set_size/2)`，其余为 0 |
| `response` | `present` 有目标、`absent` 无目标、`timeout` 超时 |
| `error_type` | `ok`、`miss`（目标存在但报告无）、`false_alarm`（目标缺失但报告有）、`timeout` |
| `timeout` | 超时标记（1/0） |

### 派生指标

| 指标 | 定义 |
|---|---|
| 正确率 | 正确试次数 ÷ 该条件正式试次数 |
| 搜索斜率 | 每名被试在 4 个集大小上的正确 RT 中位数，对集大小做最小二乘线性回归，单位 ms/项；仅使用目标存在且作答正确的试次 |
| 预览增益 | (斜率 B − 斜率 C) ÷ 斜率 B × 100% |

实验二的试次流程为：中央注视十字 500 ms → 搜索画面（预览条件先显示旧项目 1000 ms）→ 作答（限时 6000 ms）→ 对错反馈 450 ms。三个条件的项目位置、目标位置与集大小完全匹配，仅干扰项构成与呈现时序不同。
