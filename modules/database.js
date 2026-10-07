const { Sequelize, DataTypes } = require('sequelize')

// SQLite 调优(数据目录经常在网络盘/NAS 上,默认设置会很难受):
//   · journal_mode=PERSIST:默认的 delete 模式是「每个写事务:建 journal → 提交后删除 journal」,
//     在网络盘上就是每秒好几次 SMB 建/删文件(NAS 日志会被刷爆,用户反馈过这个现象)。
//     PERSIST 提交后**不删除** journal,只把文件头写回 → 不再反复增删文件(该设置持久化在数据库里,设一次就行)。
//   · synchronous=NORMAL:少一次 fsync,网络盘上收益很大。
//   · busy_timeout:网络盘偶发锁等待时不要立刻抛 SQLITE_BUSY。
const applySqliteTuning = (sequelize) => {
  ;(async () => {
    try {
      await sequelize.query('PRAGMA journal_mode = PERSIST')
      await sequelize.query('PRAGMA synchronous = NORMAL')
      await sequelize.query('PRAGMA busy_timeout = 8000')
    } catch (e) {
      console.log('[sqlite] pragma 设置失败(不影响使用):', String((e && e.message) || e))
    }
  })()
  return sequelize
}

const prepareMangaModel = (databasePath) => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: databasePath,
    logging: false
  })
  applySqliteTuning(sequelize)
  const Manga = sequelize.define('Manga', {
    id: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true
    },
    title: DataTypes.TEXT,
    coverPath: DataTypes.TEXT,
    hash: DataTypes.TEXT,
    filepath: DataTypes.TEXT,
    type: DataTypes.TEXT,
    pageCount: DataTypes.INTEGER,
    bundleSize: DataTypes.INTEGER,
    mtime: DataTypes.TEXT,
    coverHash: DataTypes.TEXT,
    status: DataTypes.TEXT,
    date: DataTypes.INTEGER,
    rating: DataTypes.FLOAT,
    tags: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    title_jpn: DataTypes.TEXT,
    // AI 翻译的中文标题(本地AI / 在线API 翻译结果)
    title_cn: DataTypes.TEXT,
    // 故事简介(详情页手动填写,随元数据同步)
    description: DataTypes.TEXT,
    filecount: DataTypes.INTEGER,
    posted: DataTypes.INTEGER,
    filesize: DataTypes.INTEGER,
    category: DataTypes.TEXT,
    url: DataTypes.TEXT,
    mark: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    hiddenBook: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    readCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    exist: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    // 新库自动带索引;已有库由 index.js 启动时用 CREATE INDEX IF NOT EXISTS 补建
    indexes: [
      { name: 'idx_mangas_filepath', fields: ['filepath'] },
      { name: 'idx_mangas_hash', fields: ['hash'] },
      { name: 'idx_mangas_bundle_mtime', fields: ['bundleSize', 'mtime'] }
    ]
  })
  return Manga
}

const prepareMetadataModel = (databasePath) => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: databasePath,
    logging: false
  })
  applySqliteTuning(sequelize)
  const Metadata = sequelize.define('Metadata', {
    hash: {
      type: DataTypes.TEXT,
      allowNull: false,
      primaryKey: true
    },
    title: DataTypes.TEXT,
    status: DataTypes.TEXT,
    rating: DataTypes.FLOAT,
    tags: {
      type: DataTypes.JSON,
      defaultValue: {}
    },
    title_jpn: DataTypes.TEXT,
    title_cn: DataTypes.TEXT,
    // 故事简介(与 Mangas.description 同步)
    description: DataTypes.TEXT,
    filecount: DataTypes.INTEGER,
    posted: DataTypes.INTEGER,
    filesize: DataTypes.INTEGER,
    category: DataTypes.TEXT,
    url: DataTypes.TEXT,
    mark: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  })
  return Metadata
}

module.exports = {
  prepareMangaModel,
  prepareMetadataModel
}