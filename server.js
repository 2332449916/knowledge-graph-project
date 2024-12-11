const express = require('express');
const neo4j = require('neo4j-driver');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const PORT = 3000;

// 配置 CORS
const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001'];
// 替换原有 CORS 配置
app.use(cors({
  origin: '*',  // 允许所有来源访问（生产环境请勿使用）
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));


app.use(express.json());

// 配置 Neo4j 驱动
const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', '123456789') // 替换为你的 Neo4j 用户名和密码
);

// 测试 Neo4j 连接
async function testNeo4jConnection() {
  const session = driver.session();
  try {
    await session.run('RETURN 1');
    console.log('Connected to Neo4j');
  } catch (error) {
    console.error('Error connecting to Neo4j:', error);
  } finally {
    await session.close();
  }
}
testNeo4jConnection();

// 配置 MySQL 数据库
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: '123456',
  database: 'school'
});

// 测试 MySQL 连接
db.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL');
});

// 根路由
app.get('/', (req, res) => {
  res.send('服务器正常运行！');
});

// Neo4j 图谱数据 API
app.get('/graph', async (req, res) => {
  const session = driver.session();
  try {
    const query = `
        MATCH (n)-[r]->(m)
        RETURN n, r, m LIMIT 1000
    `;
    const result = await session.run(query);

    const nodes = new Map();
    const links = new Set(); // 使用 Set 去重

    result.records.forEach(record => {
      const node1 = record.get('n');
      const node2 = record.get('m');
      const relation = record.get('r');

      // 添加节点
      [node1, node2].forEach(node => {
        nodes.set(node.identity.toString(), {
          id: node.identity.toString(),
          label: node.properties.name || "Unnamed Node",
          properties: node.properties
        });
      });

      // 构建唯一的关系键
      const linkKey = `${node1.identity.toString()}-${relation.type}-${node2.identity.toString()}`;
      if (!links.has(linkKey)) {
        links.add(linkKey);
      }
    });

    // 转换 Set 为数组
    const linksArray = Array.from(links).map(linkKey => {
      const [source, type, target] = linkKey.split('-');
      return { source, target, type };
    });

    res.json({
      nodes: Array.from(nodes.values()),
      links: linksArray
    });
  } catch (error) {
    console.error('Graph API Error:', error);
    res.status(500).send('服务器错误');
  } finally {
    await session.close();
  }
});


// Neo4j 实体查询 API
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

      const nodes = new Map();
      const links = new Map();

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

          const linkKey = `${node1.identity.toString()}-${node2.identity.toString()}-${relation.type}`;
          if (!links.has(linkKey)) {
              links.set(linkKey, {
                  source: node1.identity.toString(),
                  target: node2.identity.toString(),
                  type: relation.type || "未命名关系"
              });
          }
      });

      res.json({
          entity: entity,
          attributes: nodes.get([...nodes.keys()][0]).properties,
          nodes: Array.from(nodes.values()),
          links: Array.from(links.values())
      });
  } catch (error) {
      console.error('Query API Error:', error);
      res.status(500).send('服务器错误');
  } finally {
      await session.close();
  }
});



//// MySQL 学生报告 API
  // 获取所有学情报告
  app.get('/api/reports', async (req, res) => {
    try {
        const [rows] = await db.promise().query('SELECT * FROM reports');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: '获取学情报告失败' });
    }
  });

  // 添加新的学情报告
  app.post('/api/reports', async (req, res) => {
    const { student_id, average_score, report_date, remarks } = req.body;
    try {
        await db.promise().query(
            'INSERT INTO reports (student_id, average_score, report_date, remarks) VALUES (?, ?, ?, ?)',
            [student_id, average_score, report_date, remarks]
        );
        res.json({ message: '学情报告已添加' });
    } catch (error) {
        res.status(500).json({ error: '添加学情报告失败' });
    }
  });

  // 更新学情报告
  app.put('/api/reports/:id', async (req, res) => {
    const { student_id, average_score, report_date, remarks } = req.body;
    const { id } = req.params;
    try {
        const [result] = await db.promise().query(
            'UPDATE reports SET student_id = ?, average_score = ?, report_date = ?, remarks = ? WHERE report_id = ?',
            [student_id, average_score, report_date, remarks, id]
        );
        if (result.affectedRows === 0) return res.status(404).json({ message: '未找到指定报告' });
        res.json({ message: '学情报告已更新' });
    } catch (error) {
        res.status(500).json({ error: '更新学情报告失败' });
    }
  });

  // 删除学情报告
  app.delete('/api/reports/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const [result] = await db.promise().query('DELETE FROM reports WHERE report_id = ?', [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: '未找到指定报告' });
        res.json({ message: '学情报告已删除' });
    } catch (error) {
        res.status(500).json({ error: '删除学情报告失败' });
    }
  });





//

// MySQL 学生管理 API
// 获取所有学生
app.get('/api/students', async (req, res) => {
  try {
      const [rows] = await db.promise().query('SELECT * FROM students');
      res.json(rows);
  } catch (error) {
      res.status(500).json({ error: '获取学生数据失败' });
  }
});

// 添加新学生
app.post('/api/students', async (req, res) => {
  const { name, gender, birthdate, class_name } = req.body;
  try {
      await db.promise().query(
          'INSERT INTO students (name, gender, birthdate, class_name) VALUES (?, ?, ?, ?)',
          [name, gender, birthdate, class_name]
      );
      res.json({ message: '学生信息已添加' });
  } catch (error) {
      res.status(500).json({ error: '添加学生失败' });
  }
});

// 其他 PUT、DELETE 路由...


app.put('/api/students/:id', (req, res) => {
  const { id } = req.params;
  const { name, gender, birthdate, class_name } = req.body;

  db.query('UPDATE students SET name = ?, gender = ?, birthdate = ?, class = ? WHERE id = ?',
    [name, gender, birthdate, class_name, id], (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).send('服务器错误');
      }
      res.json({ message: '学生信息已更新' });
    });
});

app.delete('/api/students/:id', (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM students WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send('服务器错误');
    }
    res.json({ message: '学生已删除' });
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});



