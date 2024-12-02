const express = require('express');
const neo4j = require('neo4j-driver');
const cors = require('cors');

const app = express();
app.use(cors());  // 确保前端访问权限
app.use(express.json());

// 配置 Neo4j 驱动
const driver = neo4j.driver(
  'bolt://localhost:7687',  // 替换为你的 Bolt 地址
  neo4j.auth.basic('neo4j', '123456789')  // 替换为你的用户名和密码
);

// 根路由
app.get('/', (req, res) => {
  res.send('服务器正常运行！');
});

// 获取整个图谱数据 API 端点
app.get('/graph', async (req, res) => {
  const session = driver.session();
  try {
    const query = `
      MATCH (n)-[r]->(m)
      RETURN n, r, m LIMIT 100
    `;
    const result = await session.run(query);

    const nodes = new Map();  // 使用 Map 避免节点重复
    const links = [];

    result.records.forEach(record => {
      const node1 = record.get('n');
      const node2 = record.get('m');
      const relation = record.get('r');

      // 添加节点，避免重复
      [node1, node2].forEach(node => {
        nodes.set(node.identity.toString(), {
          id: node.identity.toString(),
          label: node.properties.name || 'Unnamed Node',  // 确保有默认标签
          properties: node.properties
        });
      });

      // 添加关系
      links.push({
        source: node1.identity.toString(),
        target: node2.identity.toString(),
        type: relation.type
      });
    });

    res.json({
      nodes: Array.from(nodes.values()),
      links
    });
  } catch (error) {
    console.error('Graph API Error:', error);
    res.status(500).send('服务器错误');
  } finally {
    await session.close();
  }
});

// 实体查询 API 端点
// 实体查询 API 端点
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

    const nodes = new Map(); // 使用 Map 避免重复节点
    const links = [];

    result.records.forEach(record => {
      const node1 = record.get('n');
      const node2 = record.get('m');
      const relation = record.get('r');

      // 确保节点有名称或默认标签
      [node1, node2].forEach(node => {
        nodes.set(node.identity.toString(), {
          id: node.identity.toString(),
          label: node.properties.name || "未命名节点",
          properties: node.properties
        });
      });

      // 确保关系有类型名称
      links.push({
        source: node1.identity.toString(),
        target: node2.identity.toString(),
        type: relation.type || "未命名关系"
      });
    });

    res.json({
      entity: entity,
      attributes: nodes.get([...nodes.keys()][0]).properties,
      nodes: Array.from(nodes.values()),
      links
    });
  } catch (error) {
    console.error('Query API Error:', error);
    res.status(500).send('服务器错误');
  } finally {
    await session.close();
  }
});


// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("Nodes:", Array.from(nodes.values()));
  console.log("Links:", links);

});
