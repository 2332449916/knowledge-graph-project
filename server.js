const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 配置 Neo4j 驱动
const driver = neo4j.driver(
  'bolt://localhost:7687',  // 替换为你的 Bolt 地址
  neo4j.auth.basic('neo4j', '123456789')  // 替换为你的 Neo4j 用户名和密码
);

// 根路由
app.get('/', (req, res) => {
  res.send('服务器正常运行！');
});

// 获取整个图谱数据的 API 端点
// 实体查询 API 端点
// 获取图谱数据端点优化
app.post('/query', async (req, res) => {
  const { entity } = req.body;
  const session = driver.session();
  
  try {
    const query = `
      MATCH (n)-[r]-(m)
      WHERE n.name = $entityName
      RETURN n, r, m
    `;
    const result = await session.run(query, { entityName: entity });
    
    if (result.records.length === 0) {
      return res.status(404).json({ message: '未找到该实体！' });
    }

    const nodes = new Map(); // 使用 Map 避免重复
    const links = [];

    result.records.forEach(record => {
      const node1 = record.get('n');
      const node2 = record.get('m');
      const relation = record.get('r');

      [node1, node2].forEach(node => {
        nodes.set(node.identity.toString(), {
          id: node.identity.toString(),
          label: node.properties.name || "未命名节点",
          properties: node.properties
        });
      });

      links.push({
        source: node1.identity.toString(),
        target: node2.identity.toString(),
        type: relation.type
      });
    });

    res.json({
      entity: entity,
      attributes: nodes.get([...nodes.keys()][0]).properties,
      nodes: Array.from(nodes.values()),
      links
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('服务器错误');
  } finally {
    await session.close();
  }
});




// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

