const Promise = require('bluebird');

class Icon {
  constructor(Services, db, env) {
    this.access = Services.getAccess(db);
    this.s3 = Services.getS3();
    this.db = db;
    this.env = env;
    this.err = Services.getError();
  }

  getUploadLink(user, vendor, id) {
    return this.access.checkApp(user, vendor, id)
      .then(() => {
        const s3 = this.s3;
        const getSignedUrl = Promise.promisify(s3.getSignedUrl.bind(s3));
        const validity = 3600;
        return getSignedUrl('putObject', {
          Bucket: this.env.S3_BUCKET,
          Key: `icons/${id}/upload.png`,
          Expires: validity,
          ContentType: 'image/png',
          ACL: 'public-read',
        })
          .then(res => ({
            link: res,
            expiresIn: validity,
          }));
      });
  }

  resize(sharp, bucket, appId, version, size) {
    return this.s3.getObject({
      Bucket: bucket,
      Key: `icons/${appId}/latest.png`,
      ResponseContentType: 'image/png',
    }).promise()
      .then(data => sharp(data.Body).resize(size, size).toBuffer())
      .then(buffer => this.s3.putObject({
        Body: buffer,
        Bucket: bucket,
        ContentType: 'image/png',
        Key: `icons/${appId}/${size}/${version}.png`,
        ACL: 'public-read',
      }).promise());
  }

  upload(sharp, appId, bucket, sourceKey) {
    let version;
    return this.s3.headObject({ Bucket: bucket, Key: sourceKey }).promise()
      .catch((err) => {
        if (err.code === 'NotFound' || err.code === 'Forbidden') {
          throw this.err.notFound(`Uploaded file ${sourceKey} was not found in s3`);
        }
        throw err;
      })
      .then(() => this.s3.copyObject({
        CopySource: `${bucket}/${sourceKey}`,
        Bucket: bucket,
        Key: `icons/${appId}/latest.png`,
        ACL: 'public-read',
      }).promise())
      .then(() => this.s3.deleteObject({ Bucket: bucket, Key: sourceKey }).promise())
      .then(() => this.db.connect(this.env)
        .then(() => this.db.addAppIcon(appId))
        .then((v) => {
          version = v;
        })
        .then(() => this.db.end())
      )
      .catch((err) => {
        this.db.end();
        throw err;
      })
      .then(() => this.resize(sharp, bucket, appId, version, 64))
      .then(() => this.resize(sharp, bucket, appId, version, 32));
  }
}

export default Icon;
