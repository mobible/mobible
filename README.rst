mobible
=======


Git
~~~

We're using git flow

::

    git checkout -b master
    git flow init

Just use all the defaults.


Node
~~~~

::

    sudo apt-get install node
    npm install mocha vumigo_v01

Mocha is the test framework.
vumigo_v01 is a collection of JS libs for developing Vumi Go JS apps with.


Django
~~~~~~

The requirements are in requirements.pip

::

    $ virtualenv ve
    $ source ve/bin/activate
    (ve)$ pip install -r requirements.pip
    ...// snip // ...
    (ve)$ cd webapp
    (ve)$ ./manage.py syncdb --migrate
    (ve)$ ./manage.py runserver

Point your browser at http://localhost:8000
