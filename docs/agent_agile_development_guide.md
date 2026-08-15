# Agent 开发的敏捷流程指南与实战示例

> **文档版本**：v1.0  
> **适用场景**：基于 LLM / RAG / Tool Use 的 Agent 应用开发  
> **Sprint 周期**：2周  
> **示例项目**：智能客服 Agent（电商售后场景）

---

## 一、Agent 开发 vs 传统软件开发的差异

| 维度 | 传统软件开发 | Agent 开发 |
|------|-------------|-----------|
| **需求** | 功能明确，输入输出确定 | 意图模糊，需定义"能力边界"而非"功能列表" |
| **设计** | 架构图、数据库设计、API 设计 | Prompt 设计、RAG 知识库设计、工具（Tool）定义 |
| **编码** | 编写业务逻辑代码 | 编写 Prompt、编排 Chain/Graph、接入工具、调优参数 |
| **测试** | 单元测试 + 集成测试，断言确定 | 评估集（Eval Set）+ 人工评判 + A/B 测试，输出非确定性 |
| **部署** | 发布二进制/容器 | 发布 Prompt 版本、模型版本、知识库版本 |
| **监控** | 错误率、延迟、吞吐量 | 意图识别准确率、幻觉率、用户满意度、Token 成本 |
| **迭代** | 修复 Bug、新增功能 | 优化 Prompt、扩充知识库、调整模型、新增工具 |

> **核心原则**：Agent 开发是"能力调优"而非"功能实现"，测试的核心是**评估（Evaluation）**而非**断言（Assertion）**。

---

## 二、Agent 开发的敏捷流程框架

```
产品愿景 -> Agent 能力定义 -> 知识库/工具准备 -> Prompt 工程 -> 评估集构建 -> 迭代调优 -> 灰度发布 -> 监控反馈 -> 循环
```

### 2.1 适配后的 Sprint 流程

| 阶段 | Agent 开发活动 | 参与角色 |
|------|---------------|---------|
| **Sprint 计划** | 定义 Agent 能力边界、用户意图分类、验收指标（准确率目标） | PO + TL + 测试 |
| **设计** | Prompt 架构设计、RAG 索引设计、工具 Schema 定义、评估集设计 | TL + 后端 + 测试 |
| **开发** | Prompt 编写、知识库构建、工具接入、Chain 编排 | 后端 + 前端 |
| **测试** | 评估集运行、人工评判、A/B Prompt 对比、幻觉检测 | 测试 + PO |
| **评审** | Agent 演示、PO 验收、评估指标达成确认 | 全员 + 业务方 |
| **发布** | Prompt 版本发布、模型切换、知识库更新、灰度放量 | DevOps + 后端 |
| **监控** | 意图分布监控、 badcase 收集、成本分析 | 测试 + PO + DevOps |

---

## 三、实战示例：智能客服 Agent（电商售后）

### 3.1 项目背景

- **业务场景**：电商平台售后客服，处理退换货、物流查询、发票申请等咨询
- **目标**：替代 60% 人工客服量，用户满意度 >= 4.2/5
- **技术栈**：LangChain / LangGraph + OpenAI GPT-4o + RAG（售后知识库）+ 工具调用（订单查询 API）
- **Sprint 周期**：2周

---

### 3.2 Sprint 0：项目启动（1周，非迭代）

#### 3.2.1 产品负责人（PO）工作

```markdown
## Agent 产品需求文档 (PRD)

### 1. 产品愿景
打造电商售后智能客服 Agent，7x24 小时处理用户售后咨询，降低人工客服成本。

### 2. 用户画像
- 主用户：电商平台消费者（售后咨询）
- 次用户：人工客服（Agent 无法处理时转接）

### 3. Agent 能力边界（Scope）
| 能力 | 范围 | 优先级 |
|------|------|--------|
| 退换货政策咨询 | 支持7天无理由、质量问题、尺码问题等场景 | P0 |
| 物流查询 | 调用订单系统查询物流状态 | P0 |
| 发票申请 | 指导用户申请电子/纸质发票 | P1 |
| 人工转接 | 情绪识别 + 复杂问题识别，自动转人工 | P0 |
| 价格保护 | 解释价保规则，引导用户申请 | P2（下期） |

### 4. 验收指标（Success Criteria）
- 意图识别准确率 >= 90%
- 回答可用率（用户未主动要求转人工） >= 75%
- 幻觉率（事实性错误） <= 2%
- 平均响应时间 <= 3秒
- 用户满意度（对话后评分） >= 4.2/5

### 5. 风险与约束
- 大模型有幻觉风险，售后政策必须基于知识库，禁止模型自由发挥
- 涉及用户隐私（订单信息），必须鉴权
- 高峰期并发 >= 500 QPS
```

#### 3.2.2 技术负责人（TL）工作

```markdown
## Agent 技术架构方案

### 1. 架构图
```
用户提问
    |
[意图识别 Router] -> 分类：退换货/物流/发票/人工/其他
    |
[ReAct Agent / LangGraph]
    |-> RAG 检索（售后政策知识库）
    |-> 工具调用（订单查询 API / 物流 API）
    |-> 安全护栏（敏感词过滤 / 幻觉检测）
    |
[回答生成] -> 输出 + 引用来源标记
    |
[反馈收集] -> 用户评分 + 转人工标记
```

### 2. 技术选型
- **框架**：LangGraph（状态机编排，支持循环推理）
- **模型**：GPT-4o（主模型）+ text-embedding-3-large（向量检索）
- **向量库**：Milvus（售后知识库向量存储）
- **工具**：订单查询 REST API、物流查询 REST API
- **护栏**：NeMo Guardrails（事实性检查 + 敏感话题拦截）
- **监控**：LangSmith（追踪链路）+ 自研指标看板

### 3. 评估策略
- **自动评估**：意图识别准确率（分类任务，可自动标注）
- **半自动评估**：回答相关性（LLM-as-a-Judge，GPT-4 打分）
- **人工评估**：幻觉检测（业务专家抽检 10%）
- **在线评估**：用户满意度评分 + 转人工率

### 4. 知识库设计
- 数据源：售后政策 PDF、FAQ Excel、历史客服对话（脱敏）
- 分块策略：按"政策条款"分块，每块 <= 512 tokens，保留上下文标题
- 索引字段：content + category + effective_date + source_doc
```

#### 3.2.3 测试工程师工作

```markdown
## 评估集 (Eval Set) 设计

### 1. 评估集规模
- 首轮构建：200 条测试用例（覆盖 5 大意图 x 4 种变体 x 10 个边界场景）
- 持续扩充：每周从线上 badcase 中补充 20 条

### 2. 评估集格式
```json
{
  "id": "EVAL-001",
  "category": "退换货-质量问题",
  "user_query": "我买的鞋子穿了三天就开胶了，能退吗？",
  "expected_intent": "return_policy",
  "expected_sub_intent": "quality_issue",
  "expected_tools": ["order_lookup"],
  "expected_answer_contains": ["质量问题", "7天内", "包退", "运费承担"],
  "ground_truth": "根据售后政策，商品存在质量问题，7天内可申请退货，退货运费由商家承担。",
  "difficulty": "easy",
  "source": "manual"
}
```

### 3. 评估维度与通过标准
| 维度 | 评估方法 | 通过标准 |
|------|---------|---------|
| 意图识别 | 自动对比分类标签 | 准确率 >= 90% |
| 工具调用 | 自动对比工具名+参数 | 正确率 >= 85% |
| 回答相关性 | LLM-as-a-Judge (0-5分) | 平均分 >= 4.0 |
| 事实一致性 | 人工抽检 + 护栏检测 | 幻觉率 <= 2% |
| 回答完整性 | 检查 expected_answer_contains | 包含率 >= 90% |
```

---

### 3.3 Sprint 1：核心能力构建（2周）

#### 3.3.1 Day 1-2：Sprint 计划 + 设计

**PO 主持 Sprint 计划会**：
- 确定 Sprint 目标："实现退换货咨询与物流查询的准确应答，意图识别准确率 >= 90%"
- 拆解用户故事：
  - Story 1：构建售后知识库（RAG 索引）
  - Story 2：实现意图识别 Router
  - Story 3：实现退换货政策问答（RAG + Prompt）
  - Story 4：实现物流查询工具调用
  - Story 5：构建评估集并跑通评估流水线

**TL 主持技术方案评审**：
- 确定 Prompt 架构：System Prompt + Few-shot Examples + RAG Context + Tool Descriptions
- 确定知识库分块策略
- 确定评估流水线：每次代码提交自动跑评估集，生成报告

---

#### 3.3.2 Day 3-7：开发迭代

**后端开发工程师工作**：

```python
# agent/core/prompts.py
SYSTEM_PROMPT = """你是一个专业的电商售后客服助手。你的职责是帮助用户解决售后问题。

## 核心原则
1. 所有政策类回答必须基于提供的知识库内容，禁止编造
2. 涉及用户订单信息时，必须先调用订单查询工具确认身份
3. 如果用户情绪激动或问题超出能力范围，主动提供转人工选项
4. 回答必须简洁（<=150字），并标注政策来源

## 可用工具
- order_lookup: 查询用户订单信息（需要订单号或手机号）
- logistics_query: 查询物流状态（需要订单号）
- human_transfer: 转接人工客服

## 知识库引用格式
请在回答末尾标注引用来源：[来源: 售后政策-退换货条款-第X条]

## 安全约束
- 禁止透露其他用户信息
- 禁止承诺超出政策范围的补偿
- 禁止提供平台外部联系方式
"""

FEW_SHOT_EXAMPLES = [
    {
        "input": "我买的衣服尺码不合适，想换大一码",
        "thought": "用户想换货，属于退换货政策范畴。不需要查询订单，直接基于知识库回答。",
        "action": "rag_query",
        "action_input": "换货政策 尺码不合适",
        "observation": "【知识库】7天无理由换货：商品未穿着、吊牌完好，可换同款式其他尺码...",
        "final_answer": "您可以申请换货！请确保商品未穿着且吊牌完好，在7天内提交换货申请。换货运费需您自行承担。[来源: 售后政策-退换货条款-第2条]"
    }
]
```

```python
# agent/core/router.py
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph

class AgentState:
    query: str
    intent: str
    context: list
    tools_called: list
    final_answer: str
    confidence: float

def intent_classifier(state: AgentState):
    """意图识别节点"""
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    # 分类：return_policy, logistics, invoice, human_transfer, other
    ...

def rag_retriever(state: AgentState):
    """RAG 检索节点"""
    # 向量检索 Top-3
    ...

def tool_executor(state: AgentState):
    """工具执行节点"""
    # 调用订单/物流 API
    ...

def answer_generator(state: AgentState):
    """回答生成节点"""
    # 结合上下文生成回答，带引用标记
    ...

# 编排状态机
workflow = StateGraph(AgentState)
workflow.add_node("classify", intent_classifier)
workflow.add_node("retrieve", rag_retriever)
workflow.add_node("tool", tool_executor)
workflow.add_node("generate", answer_generator)
workflow.add_conditional_edges("classify", route_by_intent)
...
```

**DevOps 工程师工作**：

```yaml
# .github/workflows/agent-eval.yml
name: Agent Evaluation Pipeline
on: [push, pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Environment
        run: |
          pip install -r requirements.txt
          docker-compose up -d milvus

      - name: Load Knowledge Base
        run: python scripts/load_kb.py --env=test

      - name: Run Eval Set
        run: python eval/run_eval.py --dataset=eval/sprint1_eval.json --output=reports/

      - name: Check Thresholds
        run: |
          python eval/check_thresholds.py \
            --intent-acc=0.90 \
            --hallucination-rate=0.02 \
            --report=reports/eval_report.json

      - name: Upload Report
        uses: actions/upload-artifact@v4
        with:
          name: eval-report
          path: reports/
```

**测试工程师工作**：

```python
# eval/run_eval.py
import json
from agent.core import AgentWorkflow
from eval.metrics import IntentAccuracy, HallucinationDetector, LLMJudge

def run_eval(dataset_path: str):
    agent = AgentWorkflow()
    results = []

    for case in load_dataset(dataset_path):
        # 运行 Agent
        response = agent.run(case["user_query"])

        # 评估意图识别
        intent_acc = IntentAccuracy().score(
            predicted=response.intent,
            expected=case["expected_intent"]
        )

        # 评估幻觉（LLM-as-a-Judge + 关键词匹配）
        hallucination = HallucinationDetector().check(
            answer=response.final_answer,
            ground_truth=case["ground_truth"],
            retrieved_context=response.context
        )

        # 评估回答质量
        quality = LLMJudge().score(
            answer=response.final_answer,
            criteria=case["expected_answer_contains"]
        )

        results.append({
            "case_id": case["id"],
            "intent_acc": intent_acc,
            "hallucination": hallucination,
            "quality_score": quality
        })

    return generate_report(results)

# 评估报告示例输出
"""
========================================
Agent Evaluation Report - Sprint 1
========================================
总用例数: 200
意图识别准确率: 91.5% PASS (目标: >=90%)
幻觉率: 1.8% PASS (目标: <=2%)
回答质量平均分: 4.2/5.0 PASS
工具调用正确率: 87.0% PASS (目标: >=85%)

失败用例分析 (Top 5):
- EVAL-042: "鞋子穿了两个月开胶" -> 误判为"正常磨损"（应为"质量问题"）
- EVAL-089: 物流查询时未识别"顺丰快递"简称
- ...

建议优化:
1. 补充"使用时长+质量问题"的 Few-shot 示例
2. 物流查询工具增加快递公司别名映射
========================================
"""
```

---

#### 3.3.3 Day 8-9：测试与调优

**测试工程师 + PO 工作**：

1. **自动评估**：每次 Prompt 修改后触发 CI 评估流水线，对比指标变化
2. **A/B Prompt 测试**：
   - Variant A：当前 Prompt（System + Few-shot）
   - Variant B：增加 CoT（Chain-of-Thought）推理步骤
   - 在 50 条困难用例上对比，选择指标更优版本
3. **人工抽检**：PO 抽取 20 条回答，从业务角度评判可用性
4. **Badcase 入库**：将失败用例加入评估集，持续扩充

**Prompt 调优记录**：

```markdown
## Prompt 调优日志

### 2026-06-20: 解决 EVAL-042 质量问题误判
**问题**：用户说"穿了两个月开胶"，Agent 回答"超过7天无法退换"
**根因**：模型未理解"开胶"属于质量问题（不受7天限制）
**优化**：在 System Prompt 中增加："质量问题不受7天限制，以商品实际质量状况为准"
**在 Few-shot 中增加**：质量问题示例（穿两个月开胶 -> 可退）
**结果**：重新跑评估集，EVAL-042 通过，意图识别准确率从 89% -> 91.5%

### 2026-06-21: 降低回答长度
**问题**：部分回答超过 200 字，用户反馈"太啰嗦"
**优化**：System Prompt 增加"回答必须简洁（<=150字），复杂问题分步骤说明"
**结果**：平均回答长度从 180字 -> 120字，用户满意度评分提升 0.3
```

---

#### 3.3.4 Day 10：Sprint 评审与回顾

**Sprint 评审会**：
- 演示：现场输入 5 个真实用户问题，展示 Agent 回答
- 评估报告：展示 CI 生成的评估报告，指标全部达标
- PO 验收：确认回答符合业务预期，批准进入发布流程

**Sprint 回顾会**：
- 做得好的：评估流水线自动化，Prompt 调优有数据支撑
- 待改进：知识库更新后需要手动重建索引，耗时 30 分钟；建议自动化
- 下 Sprint 计划：增加发票申请能力 + 优化转人工策略

---

### 3.4 发布与监控（Sprint 1 结束后）

#### 3.4.1 DevOps 发布流程

```markdown
## Agent 发布手册 v1.0.0

### 发布内容
- Prompt 版本：v1.0.0（System Prompt + Few-shot v3）
- 知识库版本：售后政策 KB-20240620
- 模型版本：GPT-4o-2024-08-06
- 代码版本：git tag v1.0.0

### 发布步骤
1. [ ] 备份当前生产 Prompt 版本（可回滚）
2. [ ] 灰度发布：5% 流量 -> 观察 30 分钟
3. [ ] 检查监控指标：
   - 意图识别准确率（实时抽样）
   - 平均响应时间
   - 错误率 / 超时率
   - Token 成本（每对话平均消耗）
4. [ ] 逐步放量：5% -> 20% -> 50% -> 100%
5. [ ] 每个阶段观察 15 分钟，异常立即回滚

### 回滚策略
- 一键切换至上一版本 Prompt（存储在 Redis / 配置中心）
- 模型版本不变，仅回滚 Prompt + 知识库索引
- 回滚触发条件：错误率 > 5% 或用户满意度 < 3.5（实时评分）
```

#### 3.4.2 监控看板（持续）

| 监控维度 | 指标 | 告警阈值 | 负责人 |
|---------|------|---------|--------|
| **业务指标** | 意图识别准确率 | < 85% | 测试 |
| | 用户满意度 | < 4.0 | PO |
| | 转人工率 | > 30% | PO |
| | 对话解决率 | < 70% | 测试 |
| **技术指标** | P99 响应时间 | > 5s | DevOps |
| | 错误率 | > 2% | DevOps |
| | Token 成本/对话 | > 0.5元 | DevOps |
| **质量指标** | 幻觉率（护栏拦截） | > 3% | 测试 |
| | 知识库未命中 rate | > 15% | 后端 |
| **安全指标** | 敏感词触发次数 | > 0 | 后端 |
| | 越权访问次数 | > 0 | DevOps |

#### 3.4.3 Badcase 闭环流程

```
线上用户对话
    |
[自动标记] 用户评分 <= 3 星 / 主动要求转人工 / 护栏触发幻觉警告
    |
[人工复核] 测试工程师每日抽检 10 条标记对话
    |
[分类归因] -> Prompt 问题 / 知识库缺失 / 意图误判 / 工具故障 / 模型局限
    |
[入库] 加入评估集（eval/continuous/）
    |
[排期修复] 进入下个 Sprint 或 Hotfix
    |
[验证] 修复后跑评估集确认回归通过
```

---

## 四、Agent 开发各角色 Sprint 工作清单

### 4.1 产品负责人 (PO)

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 前 | 定义 Agent 能力边界与验收指标 | Agent PRD、意图分类表 |
| 每日 | 回答业务规则咨询、抽检线上对话 | 业务规则更新记录 |
| 每 Sprint | 评审 Agent 演示、验收指标达成情况 | 验收签字、发布批准 |
| 持续 | 分析转人工原因、优化业务规则 | 知识库更新需求 |

### 4.2 Scrum Master

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| 每日 | 站会同步：评估流水线状态、Badcase 处理进度 | 障碍看板 |
| 每 Sprint | 确保评估集扩充、Prompt 调优有数据支撑 | Sprint 数据报告 |
| 持续 | 推动"评估驱动开发"文化落地 | 团队成熟度评估 |

### 4.3 后端开发工程师

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 中 | 开发 Agent 节点（Router/RAG/Tool/Generate） | 代码 + 单元测试 |
| 每日 | 修复评估流水线失败用例、优化 Prompt | Prompt 调优日志 |
| 持续 | 维护知识库索引、工具 Schema、护栏规则 | 技术文档 |

### 4.4 测试工程师 (SDET)

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 初 | 构建/扩充评估集、设计评估维度 | Eval Set JSON |
| 每日 | 监控 CI 评估报告、分析失败用例 | 评估报告 |
| 每 Sprint | 人工抽检回答质量、 hallucination 检测 | 质量评估报告 |
| 持续 | 维护自动化评估流水线、LLM-as-a-Judge 提示词 | 评估框架代码 |

### 4.5 DevOps 工程师

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 中 | 搭建 Agent CI/CD 流水线（评估自动跑） | GitHub Actions YAML |
| 发布日 | 执行灰度发布、监控发布指标 | 发布手册、监控看板 |
| 持续 | 维护模型调用成本监控、Token 用量告警 | 成本报告 |

### 4.6 UI/UX 设计师（如有对话界面）

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 中 | 设计对话界面、反馈组件（评分/转人工按钮） | UI 稿 |
| 持续 | 优化交互体验（加载状态、错误提示、引用展示） | 走查报告 |

### 4.7 技术负责人 (TL)

| 时间 | 工作项 | 输出物 |
|------|--------|--------|
| Sprint 初 | 评审 Agent 架构、Prompt 设计、评估策略 | 架构文档 |
| 持续 | 把控模型选型、成本预算、安全合规 | 技术决策记录 |
| 每 Sprint | 审查护栏规则、幻觉检测逻辑、数据隐私处理 | 安全审查报告 |

---

## 五、Agent 开发关键原则总结

| 原则 | 说明 |
|------|------|
| **评估驱动** | 没有评估集就没有优化方向，每次 Prompt 修改必须有指标对比 |
| **知识库优先** | 事实性内容必须来自 RAG，模型只负责"理解+组织语言" |
| **护栏必配** | 输出前必须经过安全护栏（敏感词、幻觉、越权） |
| **灰度发布** | Agent 发布是 Prompt/模型/知识库的版本切换，必须灰度 + 可回滚 |
| **Badcase 闭环** | 线上失败对话必须入库评估集，驱动下轮迭代 |
| **成本意识** | 监控 Token 消耗，平衡模型能力与经济可行性 |
| **人机协同** | 明确 Agent 能力边界，复杂/情绪场景优雅转人工 |

---

## 六、文档版本

| 版本 | 日期 | 修订内容 |
|------|------|---------|
| v1.0 | 2026-06-28 | 初始版本，定义 Agent 敏捷流程与智能客服示例 |

> **适用说明**：本文档基于通用 LLM Agent 开发场景编写，具体实施时需根据所用框架（LangChain/LlamaIndex/AutoGen 等）和模型（GPT/Claude/国产模型）调整技术细节。
