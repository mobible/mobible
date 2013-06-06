# -*- coding: utf-8 -*-
import datetime
from south.db import db
from south.v2 import SchemaMigration
from django.db import models


class Migration(SchemaMigration):

    def forwards(self, orm):
        # Adding model 'Journey'
        db.create_table(u'dbs_journey', (
            (u'id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('title', self.gf('django.db.models.fields.CharField')(max_length=255)),
            ('created_at', self.gf('django.db.models.fields.DateTimeField')(auto_now_add=True, blank=True)),
            ('updated_at', self.gf('django.db.models.fields.DateTimeField')(auto_now=True, blank=True)),
        ))
        db.send_create_signal(u'dbs', ['Journey'])

        # Adding model 'Verse'
        db.create_table(u'dbs_verse', (
            (u'id', self.gf('django.db.models.fields.AutoField')(primary_key=True)),
            ('journey', self.gf('django.db.models.fields.related.ForeignKey')(to=orm['dbs.Journey'])),
            ('index', self.gf('django.db.models.fields.IntegerField')()),
            ('context', self.gf('django.db.models.fields.TextField')()),
            ('verse', self.gf('django.db.models.fields.TextField')()),
            ('created_at', self.gf('django.db.models.fields.DateTimeField')(auto_now_add=True, blank=True)),
            ('updated_at', self.gf('django.db.models.fields.DateTimeField')(auto_now=True, blank=True)),
        ))
        db.send_create_signal(u'dbs', ['Verse'])


    def backwards(self, orm):
        # Deleting model 'Journey'
        db.delete_table(u'dbs_journey')

        # Deleting model 'Verse'
        db.delete_table(u'dbs_verse')


    models = {
        u'dbs.journey': {
            'Meta': {'object_name': 'Journey'},
            'created_at': ('django.db.models.fields.DateTimeField', [], {'auto_now_add': 'True', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'title': ('django.db.models.fields.CharField', [], {'max_length': '255'}),
            'updated_at': ('django.db.models.fields.DateTimeField', [], {'auto_now': 'True', 'blank': 'True'})
        },
        u'dbs.verse': {
            'Meta': {'object_name': 'Verse'},
            'context': ('django.db.models.fields.TextField', [], {}),
            'created_at': ('django.db.models.fields.DateTimeField', [], {'auto_now_add': 'True', 'blank': 'True'}),
            u'id': ('django.db.models.fields.AutoField', [], {'primary_key': 'True'}),
            'index': ('django.db.models.fields.IntegerField', [], {}),
            'journey': ('django.db.models.fields.related.ForeignKey', [], {'to': u"orm['dbs.Journey']"}),
            'updated_at': ('django.db.models.fields.DateTimeField', [], {'auto_now': 'True', 'blank': 'True'}),
            'verse': ('django.db.models.fields.TextField', [], {})
        }
    }

    complete_apps = ['dbs']